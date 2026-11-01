import { describe, expect, it } from "vitest";
import { FILL_STEP_KINDS, SECTION_LAYOUT, buildFillPlan, type FillStep } from "../../src/plan/buildFillPlan";
import { MEETING_FIELDS, SPEAKER_FIELDS } from "../../src/spec/fields";
import { validateEvent } from "../../src/spec/validateEvent";
import { catalog, validEvent } from "./testData";

const plan = (input: Record<string, unknown>) => buildFillPlan(validateEvent(input, catalog));
const indexOfName = (steps: readonly FillStep[], name: string) => steps.findIndex((s) => "name" in s && s.name === name);
const indexOfPanel = (steps: readonly FillStep[], panelId: string) =>
  steps.findIndex((s) => s.kind === "open-section" && s.panelId === panelId);

describe("buildFillPlan: invalid input", () => {
  it.each([null, undefined, {}, "event", 5])("throws TypeError for %j", (input) => {
    expect(() => buildFillPlan(input as never)).toThrow(TypeError);
    expect(() => buildFillPlan(input as never)).toThrow(/validateEvent/);
  });

  it("rejects a look-alike object that did not come from validateEvent", () => {
    const real = validateEvent(validEvent, catalog);
    const fake = { values: { ...real.values }, locationType: real.locationType, registrationType: real.registrationType };
    expect(() => buildFillPlan(fake)).toThrow(/validateEvent/);
  });
});

describe("buildFillPlan: the minimal event", () => {
  it("produces exactly these steps, in this order", () => {
    expect(plan(validEvent)).toEqual([
      { kind: "open-section", panelId: "_event_host" },
      { kind: "set-ou", name: "meeting[meeting_host][0][spoid]", value: "STB13781" },
      { kind: "set-text", name: "meeting[meeting_host][0][contact_email]", value: "branch@example.org" },
      { kind: "open-section", panelId: "_event_basics" },
      { kind: "set-text", name: "meeting[title]", value: "Embedded Systems Workshop" },
      { kind: "set-select", name: "meeting[category_id]", value: "2" },
      { kind: "set-datetime", name: "meeting[start_time]", value: "10 Nov 2026 06:00 PM" },
      { kind: "set-datetime", name: "meeting[end_time]", value: "10 Nov 2026 08:00 PM" },
      { kind: "set-select", name: "meeting[tm_zone_info]", value: "America/Denver" },
      { kind: "set-richtext", name: "meeting[description]", html: "<p>Hands-on intro.</p>" },
      { kind: "set-text", name: "meeting[keywords]", value: "embedded workshop" },
      { kind: "open-section", panelId: "_event_location" },
      { kind: "set-radio", name: "meeting[location_type]", value: "physical" },
      { kind: "set-text", name: "meeting[city]", value: "Example City" },
      { kind: "set-select", name: "meeting[country_id]", value: "221" },
      { kind: "open-section", panelId: "_event_registration" },
      { kind: "set-radio", name: "_registration_type", value: "Standard" },
    ]);
  });

  it("returns a frozen plan of frozen steps", () => {
    const steps = plan(validEvent);
    expect(Object.isFrozen(steps)).toBe(true);
    expect(steps.every((s) => Object.isFrozen(s))).toBe(true);
  });
});

describe("buildFillPlan: never saves, publishes, or cancels", () => {
  it("only uses fill step kinds", () => {
    expect([...FILL_STEP_KINDS].sort()).toEqual(
      [
        "ensure-speaker",
        "open-section",
        "set-checkbox",
        "set-datetime",
        "set-dependent-select",
        "set-ou",
        "set-radio",
        "set-richtext",
        "set-select",
        "set-text",
      ].sort(),
    );
  });

  it("produces no step mentioning publish, save, or cancel for a full event", () => {
    const steps = plan({
      ...validEvent,
      "meeting[cosponsor_name]": "Example Society",
      "meeting[require_terms]": false,
      "meeting[ieee_attending]": 10,
      "speakers[speaker1][topic]": "Talk",
    });
    for (const step of steps) {
      expect(FILL_STEP_KINDS).toContain(step.kind);
      expect(JSON.stringify(step)).not.toMatch(/publish|save|cancel/i);
    }
  });
});

describe("buildFillPlan: ordering", () => {
  it("places every fillable meeting field in exactly one section", () => {
    const placed = SECTION_LAYOUT.flatMap((s) => s.fields);
    expect([...placed].sort()).toEqual(Object.keys(MEETING_FIELDS).sort());
    expect(new Set(placed).size).toBe(placed.length);
  });

  it("opens sections in page order, each once and before its fields", () => {
    const steps = plan({ ...validEvent, "meeting[ieee_attending]": 3, "speakers[speaker1][topic]": "Talk" });
    const panels = steps.filter((s) => s.kind === "open-section").map((s) => (s as { panelId: string }).panelId);
    expect(panels).toEqual([
      "_event_host",
      "_event_basics",
      "_event_location",
      "_event_registration",
      "_event_speakers",
      "_speaker1",
      "_event_attendance",
    ]);
    expect(indexOfPanel(steps, "_event_attendance")).toBeLessThan(indexOfName(steps, "meeting[ieee_attending]"));
  });

  it("does not open sections that have nothing to fill", () => {
    const steps = plan(validEvent);
    expect(indexOfPanel(steps, "_event_speakers")).toBe(-1);
    expect(indexOfPanel(steps, "_event_attendance")).toBe(-1);
  });

  it("sets the show/hide radios before the fields they reveal, whatever the JSON order", () => {
    const { ["meeting[city]"]: city, ["meeting[country_id]"]: country, ...rest } = validEvent;
    const steps = plan({
      ...rest,
      "meeting[city]": city,
      "meeting[country_id]": country,
      "meeting[registration_url]": "https://example.org/register",
      "meeting[location_type]": "hybrid",
      "meeting[virtual_info]": "<p>Join online</p>",
      _registration_type: "External",
    });
    const openLocation = indexOfPanel(steps, "_event_location");
    expect(steps[openLocation + 1]).toEqual({ kind: "set-radio", name: "meeting[location_type]", value: "hybrid" });
    const openRegistration = indexOfPanel(steps, "_event_registration");
    expect(steps[openRegistration + 1]).toEqual({ kind: "set-radio", name: "_registration_type", value: "Custom" });
    expect(indexOfName(steps, "meeting[registration_url]")).toBeGreaterThan(openRegistration + 1);
  });

  it("produces the same plan regardless of JSON key order", () => {
    const reversed = Object.fromEntries(Object.entries(validEvent).reverse());
    expect(plan(reversed)).toEqual(plan(validEvent));
  });

  it("sets each dependent select after its parent and names the parent", () => {
    const steps = plan({
      ...validEvent,
      "meeting[subcategory_id]": "ExCom",
      "meeting[state_id]": "Colorado",
      "speakers[speaker1][country_id]": "Canada",
      "speakers[speaker1][state_id]": "Ontario",
    });
    for (const [child, parent] of [
      ["meeting[subcategory_id]", "meeting[category_id]"],
      ["meeting[state_id]", "meeting[country_id]"],
      ["speakers[speaker1][state_id]", "speakers[speaker1][country_id]"],
    ] as const) {
      expect(indexOfName(steps, child)).toBeGreaterThan(indexOfName(steps, parent));
    }
    expect(steps[indexOfName(steps, "meeting[state_id]")]).toEqual({
      kind: "set-dependent-select",
      name: "meeting[state_id]",
      input: "Colorado",
      parent: "meeting[country_id]",
    });
    expect(steps[indexOfName(steps, "speakers[speaker1][country_id]")]).toEqual({
      kind: "set-select",
      name: "speakers[speaker1][country_id]",
      value: "36",
    });
  });
});

describe("buildFillPlan: values", () => {
  it("skips blank optional values but keeps false checkboxes", () => {
    const steps = plan({
      ...validEvent,
      "meeting[cosponsor_name]": "",
      "meeting[reg_start_time]": "  ",
      "meeting[require_terms]": false,
      "meeting[enable_cohost_url]": true,
    });
    expect(indexOfName(steps, "meeting[cosponsor_name]")).toBe(-1);
    expect(indexOfName(steps, "meeting[reg_start_time]")).toBe(-1);
    expect(steps).toContainEqual({ kind: "set-checkbox", name: "meeting[require_terms]", checked: false });
    expect(steps).toContainEqual({ kind: "set-checkbox", name: "meeting[enable_cohost_url]", checked: true });
  });

  it("fills numbers as their normalized text", () => {
    expect(plan({ ...validEvent, "meeting[max_registrations]": " 040 " })).toContainEqual({
      kind: "set-text",
      name: "meeting[max_registrations]",
      value: "40",
    });
  });
});

describe("buildFillPlan: speakers", () => {
  it("orders speakers numerically, each with ensure-speaker and its own panel first", () => {
    const steps = plan({
      ...validEvent,
      "speakers[speaker10][topic]": "Ten",
      "speakers[speaker2][organization]": "Org",
      "speakers[speaker2][topic]": "Two",
    });
    const speakerSteps = steps.slice(indexOfPanel(steps, "_event_speakers"));
    expect(speakerSteps).toEqual([
      { kind: "open-section", panelId: "_event_speakers" },
      { kind: "ensure-speaker", index: 2 },
      { kind: "open-section", panelId: "_speaker2" },
      { kind: "set-text", name: "speakers[speaker2][topic]", value: "Two" },
      { kind: "set-text", name: "speakers[speaker2][organization]", value: "Org" },
      { kind: "ensure-speaker", index: 10 },
      { kind: "open-section", panelId: "_speaker10" },
      { kind: "set-text", name: "speakers[speaker10][topic]", value: "Ten" },
    ]);
  });

  it("fills a speaker's fields in page order", () => {
    const props = Object.keys(SPEAKER_FIELDS);
    const steps = plan({
      ...validEvent,
      "speakers[speaker1][organization]": "Org",
      "speakers[speaker1][display_name]": "Jane Doe",
      "speakers[speaker1][first_name]": "Jane",
      "speakers[speaker1][topic]": "Talk",
    });
    const filled = steps
      .filter((s) => "name" in s && s.name.startsWith("speakers[speaker1]"))
      .map((s) => (s as { name: string }).name.replace("speakers[speaker1][", "").replace("]", ""));
    expect(filled).toEqual([...filled].sort((a, b) => props.indexOf(a) - props.indexOf(b)));
    expect(filled).toEqual(["topic", "first_name", "display_name", "organization"]);
  });
});
