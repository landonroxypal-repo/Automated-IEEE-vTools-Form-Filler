import {
  LOCATION_TYPE_FIELD,
  REGISTRATION_TYPE_FIELD,
  SPEAKER_FIELDS,
  isSpeakerKey,
  lookupField,
  parentFieldOf,
  parseSpeakerKey,
} from "../spec/fields";
import { isValidatedEvent, type ValidatedEvent } from "../spec/validateEvent";

/**
 * One action on the Create Event page. Names are the form's HTML name attributes. There is
 * deliberately no step kind that saves, publishes, or cancels; the person does that themselves.
 */
export type FillStep =
  | { kind: "open-section"; panelId: string }
  /** Make sure speakers[speakerN] exists on the page, clicking "Add speaker" as needed. */
  | { kind: "ensure-speaker"; index: number }
  | { kind: "set-radio"; name: string; value: string }
  | { kind: "set-text"; name: string; value: string }
  | { kind: "set-checkbox"; name: string; checked: boolean }
  /** value is already the option's ID. */
  | { kind: "set-select"; name: string; value: string }
  /** input is a label or ID to resolve once the parent's choice has loaded this select's options. */
  | { kind: "set-dependent-select"; name: string; input: string; parent: string }
  | { kind: "set-richtext"; name: string; html: string }
  | { kind: "set-datetime"; name: string; value: string }
  | { kind: "set-ou"; name: string; value: string };

export const FILL_STEP_KINDS: readonly FillStep["kind"][] = Object.freeze([
  "open-section",
  "ensure-speaker",
  "set-radio",
  "set-text",
  "set-checkbox",
  "set-select",
  "set-dependent-select",
  "set-richtext",
  "set-datetime",
  "set-ou",
]);

const SPEAKERS_PANEL = "_event_speakers";

/**
 * The form's accordion sections in page order, with each section's fields in the order they
 * are filled. Show/hide radios come first in their section, and parents before dependents.
 * Speakers are filled per speaker when the speakers section is reached.
 */
export const SECTION_LAYOUT: readonly { panelId: string; fields: readonly string[] }[] = Object.freeze([
  {
    panelId: "_event_host",
    fields: [
      "meeting[meeting_host][0][spoid]",
      "meeting[meeting_host][0][contact_email]",
      "meeting[meeting_host][0][contact_registration_notification]",
      "meeting[enable_cohost_url]",
      "meeting[cosponsor_name]",
      "meeting[contact_display]",
    ],
  },
  {
    panelId: "_event_basics",
    fields: [
      "meeting[title]",
      "meeting[category_id]",
      "meeting[subcategory_id]",
      "meeting[start_time]",
      "meeting[end_time]",
      "meeting[tm_zone_info]",
      "meeting[description]",
      "meeting[header]",
      "meeting[footer]",
      "meeting[agenda]",
      "meeting[keywords]",
      "meeting[survey_url]",
    ],
  },
  {
    panelId: "_event_location",
    fields: [
      LOCATION_TYPE_FIELD,
      "meeting[virtual_info]",
      "meeting[address1]",
      "meeting[address2]",
      "meeting[city]",
      "meeting[country_id]",
      "meeting[state_id]",
      "meeting[postal_code]",
      "meeting[building]",
      "meeting[room_number]",
      "meeting[map_url]",
      "meeting[user_override_latitude]",
      "meeting[user_override_longitude]",
    ],
  },
  {
    panelId: "_event_registration",
    fields: [
      REGISTRATION_TYPE_FIELD,
      "meeting[reg_start_time]",
      "meeting[reg_end_time]",
      "meeting[max_registrations]",
      "meeting[max_registrations_virtual]",
      "meeting[require_terms]",
      "meeting[registration_url]",
    ],
  },
  { panelId: SPEAKERS_PANEL, fields: [] },
  { panelId: "_event_attendance", fields: ["meeting[ieee_attending]", "meeting[guests_attending]"] },
].map((section) => Object.freeze({ ...section, fields: Object.freeze(section.fields) })));

const isBlank = (value: string | boolean) => typeof value === "string" && value.trim() === "";

function stepFor(name: string, value: string | boolean): FillStep {
  const def = lookupField(name);
  switch (def.kind) {
    case "text":
    case "number":
      return { kind: "set-text", name, value: value as string };
    case "richtext":
      return { kind: "set-richtext", name, html: value as string };
    case "datetime":
      return { kind: "set-datetime", name, value: value as string };
    case "checkbox":
      return { kind: "set-checkbox", name, checked: value as boolean };
    case "ou-picker":
      return { kind: "set-ou", name, value: value as string };
    case "select":
      return { kind: "set-select", name, value: value as string };
    case "radio":
      return { kind: "set-radio", name, value: value as string };
    case "dependent-select":
      return { kind: "set-dependent-select", name, input: value as string, parent: parentFieldOf(name) };
  }
}

function speakerSteps(event: ValidatedEvent): FillStep[] {
  const bySpeaker = new Map<number, Set<string>>();
  for (const [name, value] of Object.entries(event.values)) {
    if (!isSpeakerKey(name) || isBlank(value)) continue;
    const { index, prop } = parseSpeakerKey(name);
    bySpeaker.set(index, (bySpeaker.get(index) ?? new Set()).add(prop));
  }

  const steps: FillStep[] = [];
  for (const index of [...bySpeaker.keys()].sort((a, b) => a - b)) {
    steps.push({ kind: "ensure-speaker", index }, { kind: "open-section", panelId: `_speaker${index}` });
    for (const prop of Object.keys(SPEAKER_FIELDS)) {
      if (!bySpeaker.get(index)!.has(prop)) continue;
      const name = `speakers[speaker${index}][${prop}]`;
      steps.push(stepFor(name, event.values[name]!));
    }
  }
  return steps;
}

/**
 * Turns a validated event into the ordered list of page actions that fill it in.
 * Throws TypeError for anything that did not come straight from validateEvent.
 */
export function buildFillPlan(event: ValidatedEvent): readonly FillStep[] {
  if (!isValidatedEvent(event)) {
    throw new TypeError("buildFillPlan only accepts the result of validateEvent");
  }

  // The show/hide radios are always set explicitly, so the result never depends on page defaults.
  const values: Record<string, string | boolean> = {
    ...event.values,
    [LOCATION_TYPE_FIELD]: event.locationType,
    [REGISTRATION_TYPE_FIELD]: event.registrationType,
  };

  const steps: FillStep[] = [];
  for (const { panelId, fields } of SECTION_LAYOUT) {
    const sectionSteps =
      panelId === SPEAKERS_PANEL
        ? speakerSteps(event)
        : fields.filter((f) => Object.hasOwn(values, f) && !isBlank(values[f]!)).map((f) => stepFor(f, values[f]!));
    if (sectionSteps.length > 0) steps.push({ kind: "open-section", panelId }, ...sectionSteps);
  }
  return Object.freeze(steps.map((s) => Object.freeze(s)));
}
