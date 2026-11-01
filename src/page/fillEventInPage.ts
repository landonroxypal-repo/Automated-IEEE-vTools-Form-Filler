import { PublishCheckboxError, StepFailedError, executePlan, type ExecuteOptions } from "../executor/executePlan";
import { createPageEnv, type VtoolsWindow } from "../executor/pageEnv";
import { readOptionCatalog } from "../executor/readOptionCatalog";
import { buildFillPlan, type FillStep } from "../plan/buildFillPlan";
import { EventValidationError, PublishForbiddenError, validateEvent } from "../spec/validateEvent";
import type { FillOutcome } from "./outcome";

/** Where the page script exposes its API. callPageApi in the pop-up repeats this string. */
export const PAGE_API_KEY = "__vtoolsEventFiller";
const CREATE_FORM_ACTION = "/tego_/event/create";

const running = new WeakSet<object>();

function toOutcome(thrown: unknown, plan: readonly FillStep[] | undefined): FillOutcome {
  if (thrown instanceof PublishForbiddenError) return { status: "publish-forbidden", message: thrown.message };
  if (thrown instanceof EventValidationError) return { status: "invalid", issues: thrown.issues.map((i) => ({ ...i })) };
  if (thrown instanceof StepFailedError) {
    return {
      status: "step-failed",
      stepIndex: thrown.stepIndex,
      totalSteps: plan?.length ?? 0,
      step: { ...thrown.step },
      message: thrown.message,
    };
  }
  if (thrown instanceof PublishCheckboxError) return { status: "unsafe-page", message: thrown.message };
  if (thrown instanceof Error) return { status: "error", name: thrown.name, message: thrown.message };
  return { status: "error", name: "Error", message: String(thrown) };
}

/**
 * Runs inside the vTools page: validates the event against the page's own option lists, builds the
 * plan, and fills the form. Exceptions cannot cross back to the pop-up, so every failure is
 * returned as a FillOutcome (the pop-up rethrows it).
 */
export async function fillEventInPage(input: unknown, window: VtoolsWindow, options: ExecuteOptions = {}): Promise<FillOutcome> {
  const lock = typeof window === "object" && window !== null ? window : undefined;
  if (lock && running.has(lock)) {
    return { status: "busy", message: "This page is already being filled; wait for that run to finish." };
  }
  if (lock) running.add(lock);

  let plan: readonly FillStep[] | undefined;
  try {
    const env = createPageEnv(window);
    const form = env.document.getElementById("_events_form");
    if (form?.getAttribute("action") !== CREATE_FORM_ACTION) {
      return { status: "wrong-page", message: "This page does not have the vTools Create Event form." };
    }
    plan = buildFillPlan(validateEvent(input, readOptionCatalog(env.document)));
    const report = await executePlan(plan, env, options);
    return { status: "filled", stepsCompleted: report.stepsCompleted, totalSteps: plan.length };
  } catch (e) {
    return toOutcome(e, plan);
  } finally {
    if (lock) running.delete(lock);
  }
}

/** Exposes { fill } on the page window once; it cannot be replaced afterwards. */
export function installPageApi(window: VtoolsWindow, options: ExecuteOptions = {}): void {
  if (typeof window !== "object" || window === null) throw new TypeError("window must be an object");
  if (Object.hasOwn(window, PAGE_API_KEY)) return;
  Object.defineProperty(window, PAGE_API_KEY, {
    value: Object.freeze({ fill: (input: unknown) => fillEventInPage(input, window, options) }),
    writable: false,
    configurable: false,
    enumerable: false,
  });
}
