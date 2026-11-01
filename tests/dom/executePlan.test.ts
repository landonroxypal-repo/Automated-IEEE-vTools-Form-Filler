import { describe, expect, it, vi } from "vitest";
import { readOptionCatalog } from "../../src/executor/readOptionCatalog";
import { PublishCheckboxError, StepFailedError, executePlan } from "../../src/executor/executePlan";
import { buildFillPlan, type FillStep } from "../../src/plan/buildFillPlan";
import { OptionResolutionError } from "../../src/spec/resolveOption";
import { validateEvent } from "../../src/spec/validateEvent";
import { loadFakePage, type FakePage, type FakePageOptions } from "./fakePage";

const FAST = { timeoutMs: 300, pollMs: 5 };

const baseEvent: Record<string, unknown> = {
  "meeting[meeting_host][0][spoid]": "STB13781",
  "meeting[meeting_host][0][contact_email]": "branch@example.org",
  "meeting[title]": "Embedded Systems Workshop",
  "meeting[category_id]": "Administrative",
  "meeting[subcategory_id]": "ExCom",
  "meeting[start_time]": "10 Nov 2026 06:00 PM",
  "meeting[end_time]": "10 Nov 2026 08:00 PM",
  "meeting[tm_zone_info]": "Mountain Time (US & Canada)",
  "meeting[description]": "<p>Hands-on intro.</p>",
  "meeting[keywords]": "embedded workshop",
  "meeting[city]": "Example City",
  "meeting[country_id]": "United States",
  "meeting[state_id]": "Colorado",
  "meeting[postal_code]": "80000",
  "meeting[reg_start_time]": "01 Nov 2026 12:00 AM",
  "meeting[require_terms]": false,
  "meeting[max_registrations]": 40,
};

const withSpeakers: Record<string, unknown> = {
  ...baseEvent,
  "speakers[speaker1][topic]": "Talk one",
  "speakers[speaker1][first_name]": "Jane",
  "speakers[speaker1][display_name]": "Jane Doe",
  "speakers[speaker1][biography]": "<p>Jane's bio</p>",
  "speakers[speaker1][country_id]": "Canada",
  "speakers[speaker1][state_id]": "Ontario",
  "speakers[speaker2][topic]": "Talk two",
  "speakers[speaker3][topic]": "Talk three",
  "speakers[speaker3][biography]": "<p>Third bio</p>",
};

function setup(input: Record<string, unknown> = baseEvent, pageOptions: FakePageOptions = {}) {
  const page = loadFakePage(pageOptions);
  const plan = buildFillPlan(validateEvent(input, readOptionCatalog(page.document)));
  return { page, plan };
}

const field = (page: FakePage, name: string) =>
  Array.from(page.document.getElementsByName(name)).find(
    (el) => !(el instanceof page.window.HTMLInputElement && el.type === "hidden"),
  ) as HTMLInputElement & HTMLSelectElement;

async function failure(promise: Promise<unknown>): Promise<StepFailedError> {
  try {
    await promise;
  } catch (e) {
    expect(e).toBeInstanceOf(StepFailedError);
    return e as StepFailedError;
  }
  throw new Error("expected executePlan to fail");
}

describe("executePlan: invalid arguments", () => {
  it("rejects anything that did not come from buildFillPlan", async () => {
    const { page, plan } = setup();
    for (const bad of [null, undefined, [], [...plan], plan.map((s) => ({ ...s }))]) {
      await expect(executePlan(bad as never, page.env, FAST)).rejects.toThrow(/buildFillPlan/);
    }
  });

  it.each([
    ["null", null],
    ["an empty object", {}],
    ["one without a document", { richTextEditor: () => 0, dateTimePicker: () => 0, sleep: () => 0 }],
  ])("rejects %s as the page env", async (_label, env) => {
    const { plan } = setup();
    await expect(executePlan(plan, env as never, FAST)).rejects.toThrow(TypeError);
    await expect(executePlan(plan, env as never, FAST)).rejects.toThrow(/env must/);
  });

  it("rejects an env missing one of its functions", async () => {
    const { page, plan } = setup();
    for (const key of ["richTextEditor", "dateTimePicker", "sleep"] as const) {
      const env = { ...page.env, [key]: undefined };
      await expect(executePlan(plan, env as never, FAST)).rejects.toThrow(/env must/);
    }
  });

  it.each([{ timeoutMs: 0 }, { timeoutMs: -5 }, { timeoutMs: NaN }, { timeoutMs: "100" }, { pollMs: 0 }, { pollMs: Infinity }, { onStep: "log" }])(
    "rejects the options %j",
    async (options) => {
      const { page, plan } = setup();
      await expect(executePlan(plan, page.env, options as never)).rejects.toThrow(/options/);
    },
  );
});

describe("executePlan: filling the form", () => {
  it("fills every kind of field", async () => {
    const { page, plan } = setup(withSpeakers);
    await executePlan(plan, page.env, FAST);

    expect(field(page, "meeting[meeting_host][0][spoid]").value).toBe("STB13781");
    expect(field(page, "meeting[title]").value).toBe("Embedded Systems Workshop");
    expect(field(page, "meeting[category_id]").value).toBe("4");
    expect(field(page, "meeting[subcategory_id]").value).toBe("10");
    expect(field(page, "meeting[start_time]").value).toBe("10 Nov 2026 06:00 PM");
    expect(field(page, "meeting[tm_zone_info]").value).toBe("America/Denver");
    expect(page.editors.get("meeting_description")!.content).toBe("<p>Hands-on intro.</p>");
    expect(field(page, "meeting[description]").value).toBe("<p>Hands-on intro.</p>");
    expect(field(page, "meeting[keywords]").value).toBe("embedded workshop");
    expect(page.document.querySelector<HTMLInputElement>('input[name="meeting[location_type]"][value="physical"]')!.checked).toBe(true);
    expect(field(page, "meeting[country_id]").value).toBe("221");
    expect(field(page, "meeting[state_id]").value).toBe("6");
    expect(page.document.querySelector<HTMLInputElement>("#_registration_type_Standard")!.checked).toBe(true);
    expect(field(page, "meeting[require_terms]").checked).toBe(false);
    expect(field(page, "meeting[max_registrations]").value).toBe("40");
    expect(field(page, "speakers[speaker1][state_id]").value).toBe("9");
    expect(page.editors.get("speakers_speaker1_biography")!.content).toBe("<p>Jane's bio</p>");
  });

  it("adds speakers beyond the two already on the page", async () => {
    const { page, plan } = setup(withSpeakers);
    expect(page.document.getElementsByName("speakers[speaker3][topic]")).toHaveLength(0);
    await executePlan(plan, page.env, FAST);
    expect(field(page, "speakers[speaker3][topic]").value).toBe("Talk three");
    expect(page.editors.get("speakers_speaker3_biography")!.content).toBe("<p>Third bio</p>");
    expect(page.document.querySelectorAll("._speaker_container")).toHaveLength(3);
  });

  it("opens each section it fills", async () => {
    const { page, plan } = setup(withSpeakers);
    await executePlan(plan, page.env, FAST);
    for (const id of ["_event_host", "_event_basics", "_event_location", "_event_registration", "_event_speakers", "_speaker1", "_speaker3"]) {
      expect(page.document.getElementById(id)!.classList.contains("in")).toBe(true);
    }
  });

  it("fires input and change events so the page's own handlers run", async () => {
    const { page, plan } = setup();
    const seen: string[] = [];
    const title = field(page, "meeting[title]");
    title.addEventListener("input", () => seen.push("input"));
    title.addEventListener("change", () => seen.push("change"));
    await executePlan(plan, page.env, FAST);
    expect(seen).toEqual(["input", "change"]);
  });

  it("reports progress after each step and returns the number of steps completed", async () => {
    const { page, plan } = setup();
    const onStep = vi.fn();
    const report = await executePlan(plan, page.env, { ...FAST, onStep });
    expect(report).toEqual({ stepsCompleted: plan.length });
    expect(onStep.mock.calls).toEqual(plan.map((step, index) => [index, step]));
  });
});

describe("executePlan: never saves, publishes, or cancels", () => {
  it("only clicks section toggles, Add speaker, radios, and checkboxes", async () => {
    const { page, plan } = setup(withSpeakers);
    await executePlan(plan, page.env, FAST);
    expect(page.clicks.length).toBeGreaterThan(0);
    for (const el of page.clicks) {
      const allowed =
        el.closest('a[data-toggle="collapse"]') !== null ||
        el.id === "_add_speaker" ||
        (el instanceof page.window.HTMLInputElement && (el.type === "radio" || el.type === "checkbox"));
      expect(allowed, `unexpected click on ${el.outerHTML.slice(0, 80)}`).toBe(true);
      expect(el.textContent ?? "").not.toMatch(/save|publish|cancel/i);
    }
  });

  it("refuses to start when the publish checkbox is already checked, and changes nothing", async () => {
    const { page, plan } = setup();
    page.document.querySelector<HTMLInputElement>("#meeting_publish")!.checked = true;
    await expect(executePlan(plan, page.env, FAST)).rejects.toThrow(PublishCheckboxError);
    expect(field(page, "meeting[title]").value).toBe("");
  });

  it("refuses to start when the publish checkbox cannot be found", async () => {
    const { page, plan } = setup();
    page.document.querySelector("#meeting_publish")!.remove();
    await expect(executePlan(plan, page.env, FAST)).rejects.toThrow(PublishCheckboxError);
  });

  it("fails at the end if anything checked the publish checkbox during the run", async () => {
    const { page, plan } = setup();
    field(page, "meeting[title]").addEventListener("change", () => {
      page.document.querySelector<HTMLInputElement>("#meeting_publish")!.checked = true;
    });
    await expect(executePlan(plan, page.env, FAST)).rejects.toThrow(PublishCheckboxError);
  });
});

describe("executePlan: stops at the first failing step", () => {
  it("rejects a state label that is not in the loaded list, without waiting or continuing", async () => {
    const { page, plan } = setup({ ...baseEvent, "meeting[state_id]": "Atlantis" });
    const started = Date.now();
    const error = await failure(executePlan(plan, page.env, { timeoutMs: 2000, pollMs: 5 }));
    expect(Date.now() - started).toBeLessThan(1000);
    expect(error.cause).toBeInstanceOf(OptionResolutionError);
    expect((error.cause as OptionResolutionError).reason).toBe("unknown-label");
    expect(error.step).toMatchObject({ kind: "set-dependent-select", name: "meeting[state_id]" });
    expect(plan[error.stepIndex]).toBe(error.step);
    expect(field(page, "meeting[postal_code]").value).toBe("");
  });

  it("rejects a state ID that is not in the loaded list", async () => {
    const { page, plan } = setup({ ...baseEvent, "meeting[state_id]": "999" });
    const error = await failure(executePlan(plan, page.env, FAST));
    expect((error.cause as OptionResolutionError).reason).toBe("unknown-id");
  });

  it("times out when a dependent select's options never load, naming it and its parent", async () => {
    const { page, plan } = setup(baseEvent, { states: {} });
    const error = await failure(executePlan(plan, page.env, FAST));
    expect(error.message).toMatch(/meeting\[state_id\]/);
    expect(error.message).toMatch(/meeting\[country_id\]/);
    expect(error.message).toMatch(/300 ?ms/);
  });

  it("fails when a field is missing from the page", async () => {
    const { page, plan } = setup();
    field(page, "meeting[keywords]").remove();
    const error = await failure(executePlan(plan, page.env, FAST));
    expect(error.message).toMatch(/meeting\[keywords\].*not found/);
  });

  it("fails when two fillable elements share a name", async () => {
    const { page, plan } = setup();
    const title = field(page, "meeting[title]");
    title.after(title.cloneNode());
    const error = await failure(executePlan(plan, page.env, FAST));
    expect(error.message).toMatch(/2 elements named "meeting\[title\]"/);
  });

  it("fails when the page no longer offers an option the plan chose", async () => {
    const { page, plan } = setup();
    field(page, "meeting[tm_zone_info]").querySelector('option[value="America/Denver"]')!.remove();
    const error = await failure(executePlan(plan, page.env, FAST));
    expect((error.cause as OptionResolutionError).reason).toBe("unknown-id");
  });

  it("times out when a rich-text editor never becomes available", async () => {
    const { page, plan } = setup();
    page.editors.delete("meeting_description");
    const error = await failure(executePlan(plan, page.env, FAST));
    expect(error.message).toMatch(/rich-text editor.*meeting_description/);
  });

  it("fails when the date picker does not end up showing the requested date", async () => {
    const { page, plan } = setup();
    page.pickers.set(page.document.getElementById("_start_datetime")!, { date() {} });
    const error = await failure(executePlan(plan, page.env, FAST));
    expect(error.message).toMatch(/meeting\[start_time\].*10 Nov 2026 06:00 PM/);
  });

  it("fails when a checkbox refuses to change", async () => {
    const { page, plan } = setup();
    field(page, "meeting[require_terms]").addEventListener("click", (e) => e.preventDefault());
    const error = await failure(executePlan(plan, page.env, FAST));
    expect(error.message).toMatch(/meeting\[require_terms\]/);
  });

  it("fails when the page has no radio button with the planned value, listing the ones it has", async () => {
    const { page, plan } = setup();
    page.document.querySelector('input[name="meeting[location_type]"][value="physical"]')!.remove();
    const error = await failure(executePlan(plan, page.env, FAST));
    expect(error.message).toMatch(/physical/);
    expect(error.message).toMatch(/virtual, hybrid/);
  });

  it("times out when Add speaker never adds the speaker", async () => {
    const { page, plan } = setup(withSpeakers, { addSpeaker: false });
    const error = await failure(executePlan(plan, page.env, FAST));
    expect(error.step).toEqual({ kind: "ensure-speaker", index: 3 });
  });

  it("times out when a section never opens", async () => {
    const { page, plan } = setup(baseEvent, { bootstrap: false });
    const error = await failure(executePlan(plan, page.env, FAST));
    expect(error.step).toEqual({ kind: "open-section", panelId: "_event_basics" });
  });

  it("includes the step number and kind in the message", async () => {
    const { page, plan } = setup();
    field(page, "meeting[keywords]").remove();
    const error = await failure(executePlan(plan, page.env, FAST));
    const step = plan[error.stepIndex] as Extract<FillStep, { name: string }>;
    expect(error.message).toContain(`Step ${error.stepIndex + 1} of ${plan.length}`);
    expect(error.message).toContain(step.kind);
  });
});

describe("executePlan: black-box gaps", () => {
  const omit = (obj: Record<string, unknown>, ...keys: string[]) =>
    Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k)));

  it("selects radio buttons that are not the page defaults", async () => {
    const virtualExternal = {
      ...omit(
        baseEvent,
        "meeting[city]",
        "meeting[country_id]",
        "meeting[state_id]",
        "meeting[postal_code]",
        "meeting[reg_start_time]",
        "meeting[require_terms]",
        "meeting[max_registrations]",
      ),
      "meeting[location_type]": "Virtual",
      "meeting[virtual_info]": "<p>Join online</p>",
      _registration_type: "External",
      "meeting[registration_url]": "https://example.org/register",
    };
    const { page, plan } = setup(virtualExternal);
    const radio = (name: string, value: string) =>
      page.document.querySelector<HTMLInputElement>(`input[name="${name}"][value="${value}"]`)!;
    expect(radio("meeting[location_type]", "physical").checked).toBe(true);

    await executePlan(plan, page.env, FAST);

    expect(radio("meeting[location_type]", "virtual").checked).toBe(true);
    expect(radio("meeting[location_type]", "physical").checked).toBe(false);
    expect(radio("_registration_type", "Custom").checked).toBe(true);
    expect(radio("_registration_type", "Standard").checked).toBe(false);
    expect(field(page, "meeting[registration_url]").value).toBe("https://example.org/register");
    expect(page.editors.get("meeting_virtual_info")!.content).toBe("<p>Join online</p>");
  });

  it("chooses dependent options given as IDs", async () => {
    const { page, plan } = setup({ ...baseEvent, "meeting[subcategory_id]": "11", "meeting[state_id]": 44 });
    await executePlan(plan, page.env, FAST);
    expect(field(page, "meeting[subcategory_id]").value).toBe("11");
    expect(field(page, "meeting[state_id]").value).toBe("44");
  });

  it("names the section in the message when opening it fails", async () => {
    const { page, plan } = setup(baseEvent, { bootstrap: false });
    const error = await failure(executePlan(plan, page.env, FAST));
    expect(error.message).toContain("(open-section _event_basics)");
  });

  it("names the speaker number in the message when adding a speaker fails", async () => {
    const { page, plan } = setup(withSpeakers, { addSpeaker: false });
    const error = await failure(executePlan(plan, page.env, FAST));
    expect(error.message).toContain("(ensure-speaker speaker 3)");
  });

  it("explains publish-checkbox failures and says nothing will be saved", async () => {
    const checked = setup();
    checked.page.document.querySelector<HTMLInputElement>("#meeting_publish")!.checked = true;
    await expect(executePlan(checked.plan, checked.page.env, FAST)).rejects.toThrow(
      /publish checkbox is checked before filling.*never publishes; nothing will be saved/,
    );

    const missing = setup();
    missing.page.document.querySelector("#meeting_publish")!.remove();
    await expect(executePlan(missing.plan, missing.page.env, FAST)).rejects.toThrow(
      /Cannot find the publish checkbox before filling/,
    );
  });
});
