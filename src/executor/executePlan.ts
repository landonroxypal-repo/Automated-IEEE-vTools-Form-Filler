import { isFillPlan, type FillStep } from "../plan/buildFillPlan";
import { OptionResolutionError, resolveOption, type SelectOption } from "../spec/resolveOption";
import type { PageEnv } from "./pageEnv";

export interface ExecuteOptions {
  /** How long to wait for the page (AJAX, editors, sections) before failing a step. */
  timeoutMs?: number;
  pollMs?: number;
  /** Called after each step completes. */
  onStep?: (index: number, step: FillStep) => void;
}

export interface ExecutionReport {
  stepsCompleted: number;
}

export class StepFailedError extends Error {
  constructor(
    readonly stepIndex: number,
    readonly step: FillStep,
    total: number,
    cause: unknown,
  ) {
    const target = "name" in step ? step.name : "panelId" in step ? step.panelId : `speaker ${step.index}`;
    const reason = cause instanceof Error ? cause.message : String(cause);
    super(`Step ${stepIndex + 1} of ${total} (${step.kind} ${target}) failed: ${reason}`, { cause });
    this.name = "StepFailedError";
  }
}

/** The hidden publish checkbox was checked or missing; the tool never lets a run publish. */
export class PublishCheckboxError extends Error {
  constructor(message: string) {
    super(`${message}. This tool never publishes; nothing will be saved.`);
    this.name = "PublishCheckboxError";
  }
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_POLL_MS = 100;

const isPositiveNumber = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n > 0;

function checkArguments(plan: unknown, env: unknown, options: unknown) {
  if (!isFillPlan(plan)) throw new TypeError("executePlan only accepts a plan returned by buildFillPlan");

  const e = env as Partial<PageEnv> | null;
  if (
    typeof e !== "object" ||
    e === null ||
    typeof e.document?.getElementsByName !== "function" ||
    typeof e.richTextEditor !== "function" ||
    typeof e.dateTimePicker !== "function" ||
    typeof e.sleep !== "function"
  ) {
    throw new TypeError("env must be a PageEnv with document, richTextEditor, dateTimePicker, and sleep");
  }

  const o = (options ?? {}) as ExecuteOptions;
  if (typeof o !== "object") throw new TypeError("options must be an object");
  if (o.timeoutMs !== undefined && !isPositiveNumber(o.timeoutMs)) {
    throw new TypeError("options.timeoutMs must be a positive number of milliseconds");
  }
  if (o.pollMs !== undefined && !isPositiveNumber(o.pollMs)) {
    throw new TypeError("options.pollMs must be a positive number of milliseconds");
  }
  if (o.onStep !== undefined && typeof o.onStep !== "function") throw new TypeError("options.onStep must be a function");
}

function assertNotPublishing(document: Document, when: string) {
  const checkbox = document.getElementById("meeting_publish");
  if (!checkbox || checkbox.tagName !== "INPUT" || (checkbox as HTMLInputElement).type !== "checkbox") {
    throw new PublishCheckboxError(`Cannot find the publish checkbox ${when}, so the page cannot be checked as safe`);
  }
  if ((checkbox as HTMLInputElement).checked) {
    throw new PublishCheckboxError(`The publish checkbox is checked ${when}`);
  }
}

/**
 * Carries out a fill plan on the Create Event page, one step at a time, stopping at the first
 * failure. Never saves, publishes, or cancels: the person reviews the form and saves it.
 */
export async function executePlan(
  plan: readonly FillStep[],
  env: PageEnv,
  options: ExecuteOptions = {},
): Promise<ExecutionReport> {
  checkArguments(plan, env, options);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
  const page = new PageActions(env, timeoutMs, pollMs);

  assertNotPublishing(env.document, "before filling");
  for (const [index, step] of plan.entries()) {
    try {
      await page.run(step);
    } catch (cause) {
      throw new StepFailedError(index, step, plan.length, cause);
    }
    options.onStep?.(index, step);
  }
  assertNotPublishing(env.document, "after filling");
  return { stepsCompleted: plan.length };
}

class PageActions {
  constructor(
    private readonly env: PageEnv,
    private readonly timeoutMs: number,
    private readonly pollMs: number,
  ) {}

  private get document() {
    return this.env.document;
  }

  run(step: FillStep): Promise<void> | void {
    switch (step.kind) {
      case "open-section":
        return this.openSection(step.panelId);
      case "ensure-speaker":
        return this.ensureSpeaker(step.index);
      case "set-text":
      case "set-ou":
        return this.setText(step.name, step.value);
      case "set-checkbox":
        return this.setCheckbox(step.name, step.checked);
      case "set-radio":
        return this.setRadio(step.name, step.value);
      case "set-select":
        return this.setSelect(step.name, step.value);
      case "set-dependent-select":
        return this.setDependentSelect(step.name, step.input, step.parent);
      case "set-richtext":
        return this.setRichText(step.name, step.html);
      case "set-datetime":
        return this.setDateTime(step.name, step.value);
    }
  }

  /** Polls until ready() is true; throws a timeout error describing what never happened. */
  private async waitUntil(ready: () => boolean, what: string): Promise<void> {
    const deadline = Date.now() + this.timeoutMs;
    while (!ready()) {
      if (Date.now() >= deadline) throw new Error(`timed out after ${this.timeoutMs} ms waiting for ${what}`);
      await this.env.sleep(this.pollMs);
    }
  }

  private fire(element: Element, type: "input" | "change") {
    const EventCtor = element.ownerDocument.defaultView?.Event ?? Event;
    element.dispatchEvent(new EventCtor(type, { bubbles: true }));
  }

  /** The single element with this name that matches, ignoring hidden inputs that pair with checkboxes. */
  private one<T extends Element>(name: string, matches: (el: Element) => boolean, what: string): T {
    const found = Array.from(this.document.getElementsByName(name)).filter(matches);
    if (found.length === 0) throw new Error(`${what} "${name}" not found on the page`);
    if (found.length > 1) throw new Error(`found ${found.length} elements named "${name}"; expected one ${what}`);
    return found[0] as unknown as T;
  }

  private input(name: string, types: readonly string[]): HTMLInputElement {
    return this.one(name, (el) => el.tagName === "INPUT" && types.includes((el as HTMLInputElement).type), `${types.join("/")} input`);
  }

  private select(name: string): HTMLSelectElement {
    return this.one(name, (el) => el.tagName === "SELECT", "select");
  }

  private async openSection(panelId: string) {
    const panel = this.document.getElementById(panelId);
    if (!panel?.classList.contains("panel-collapse")) throw new Error(`section #${panelId} not found on the page`);
    if (panel.classList.contains("in")) return;
    const toggle = this.document.querySelector<HTMLElement>(`a[data-toggle="collapse"][href="#${panelId}"]`);
    if (!toggle) throw new Error(`no toggle link for section #${panelId}`);
    toggle.click();
    await this.waitUntil(() => panel.classList.contains("in"), `section #${panelId} to open`);
  }

  private async ensureSpeaker(index: number) {
    const exists = (n: number) => this.document.getElementsByName(`speakers[speaker${n}][topic]`).length > 0;
    if (exists(index)) return;
    if (index > 1 && !exists(index - 1)) throw new Error(`speaker ${index - 1} is not on the page, so speaker ${index} cannot be added`);
    const add = this.document.getElementById("_add_speaker");
    if (!add) throw new Error('the "Add speaker" button was not found on the page');
    add.click();
    await this.waitUntil(() => exists(index), `speaker ${index} to be added`);
  }

  private setText(name: string, value: string) {
    const el = this.one<HTMLInputElement | HTMLTextAreaElement>(
      name,
      (e) => e.tagName === "TEXTAREA" || (e.tagName === "INPUT" && (e as HTMLInputElement).type === "text"),
      "text field",
    );
    el.value = value;
    this.fire(el, "input");
    this.fire(el, "change");
    if (el.value !== value) throw new Error(`"${name}" shows ${JSON.stringify(el.value)} instead of ${JSON.stringify(value)}`);
  }

  private setCheckbox(name: string, checked: boolean) {
    const box = this.input(name, ["checkbox"]);
    if (box.checked !== checked) box.click();
    if (box.checked !== checked) throw new Error(`checkbox "${name}" did not change to ${checked ? "checked" : "unchecked"}`);
  }

  private setRadio(name: string, value: string) {
    const radios = Array.from(this.document.getElementsByName(name)).filter(
      (el): el is HTMLInputElement => el.tagName === "INPUT" && (el as HTMLInputElement).type === "radio",
    );
    const radio = radios.find((r) => r.value === value);
    if (!radio) {
      throw new Error(`no "${name}" radio button with value "${value}"; the page has: ${radios.map((r) => r.value).join(", ")}`);
    }
    if (!radio.checked) radio.click();
    if (!radio.checked) throw new Error(`radio "${name}" = "${value}" did not become selected`);
  }

  private chooseValue(select: HTMLSelectElement, name: string, value: string) {
    select.value = value;
    this.fire(select, "change");
    if (select.value !== value) throw new Error(`select "${name}" did not change to "${value}"`);
  }

  /** value is an ID the validator already resolved, so it must match an option exactly (no label matching). */
  private setSelect(name: string, value: string) {
    const select = this.select(name);
    if (!Array.from(select.options).some((o) => o.value === value && value !== "")) {
      throw new OptionResolutionError(name, value, "unknown-id", "is no longer one of this field's options on the page");
    }
    this.chooseValue(select, name, value);
  }

  private async setDependentSelect(name: string, input: string, parent: string) {
    // The page replaces the select when the parent's choice loads new options, so look it up each time.
    const loaded = () => {
      const select = Array.from(this.document.getElementsByName(name)).find((el) => el.tagName === "SELECT") as
        | HTMLSelectElement
        | undefined;
      return select !== undefined && !select.disabled && Array.from(select.options).some((o) => o.value !== "");
    };
    await this.waitUntil(loaded, `"${name}" options to load after choosing "${parent}"`);
    const select = this.select(name);
    const options: SelectOption[] = Array.from(select.options, (o) => ({ value: o.value, label: o.text.trim() }));
    this.chooseValue(select, name, resolveOption(name, input, options));
  }

  private async setRichText(name: string, html: string) {
    const textarea = this.one<HTMLTextAreaElement>(name, (el) => el.tagName === "TEXTAREA", "textarea");
    if (!textarea.id) throw new Error(`textarea "${name}" has no id, so its rich-text editor cannot be found`);
    const available = () => {
      try {
        this.env.richTextEditor(textarea.id);
        return true;
      } catch {
        return false;
      }
    };
    await this.waitUntil(available, `the rich-text editor for #${textarea.id}`);
    const editor = this.env.richTextEditor(textarea.id);
    editor.setContent(html);
    editor.save();
    this.fire(textarea, "change");
  }

  private setDateTime(name: string, value: string) {
    const input = this.input(name, ["text"]);
    const container = input.closest(".input-group.date");
    if (!container) throw new Error(`"${name}" is not inside a date/time picker`);
    this.env.dateTimePicker(container).date(value);
    if (input.value !== value) {
      throw new Error(`"${name}" shows ${JSON.stringify(input.value)} instead of "${value}" after setting the date picker`);
    }
  }
}
