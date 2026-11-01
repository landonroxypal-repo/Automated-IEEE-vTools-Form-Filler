import type { SelectOption } from "./resolveOption";

export type LocationType = "virtual" | "hybrid" | "physical";
export type RegistrationType = "Standard" | "Custom" | "None";
export type CatalogKey = "category" | "timezone" | "country";

export type FieldDef = {
  /** "always": must be present; "when-applicable": must be present whenever appliesTo matches. */
  required?: "always" | "when-applicable";
  appliesTo?: { location?: readonly LocationType[]; registration?: readonly RegistrationType[] };
  maxLength?: number;
} & (
  /** multiline: a <textarea>, where line breaks and tabs are allowed. */
  | { kind: "text"; format?: "email" | "url"; multiline?: boolean }
  | { kind: "number"; integer: boolean; min: number; max?: number }
  | { kind: "richtext" }
  | { kind: "datetime" }
  | { kind: "checkbox" }
  | { kind: "ou-picker" }
  | { kind: "select"; options: CatalogKey }
  /**
   * Options are loaded by AJAX after the parent select changes, so labels can only be resolved on
   * the page. parent is a full field name for meeting fields, or a sibling property for speakers.
   */
  | { kind: "dependent-select"; parent: string }
  | { kind: "radio"; options: readonly SelectOption[] }
);

const IN_PERSON = { location: ["physical", "hybrid"] } as const;
const ONLINE = { location: ["virtual", "hybrid"] } as const;
const STANDARD_REG = { registration: ["Standard"] } as const;

export const LOCATION_TYPE_FIELD = "meeting[location_type]";
export const REGISTRATION_TYPE_FIELD = "_registration_type";

/**
 * Every meeting[...] field the tool may fill, keyed by its HTML name on the Create Event page.
 * Max lengths come from the page's tooltips/maxlength attributes. Payment, co-host, custom
 * question, and menu fields are intentionally absent, as is anything to do with publishing.
 */
export const MEETING_FIELDS: Readonly<Record<string, FieldDef>> = {
  // Host
  "meeting[meeting_host][0][spoid]": { kind: "ou-picker", required: "always" },
  "meeting[meeting_host][0][contact_email]": { kind: "text", format: "email", maxLength: 512, required: "always" },
  "meeting[meeting_host][0][contact_registration_notification]": { kind: "checkbox" },
  "meeting[enable_cohost_url]": { kind: "checkbox" },
  "meeting[cosponsor_name]": { kind: "text", maxLength: 256 },
  "meeting[contact_display]": { kind: "richtext", maxLength: 512 },

  // Details
  "meeting[title]": { kind: "text", maxLength: 256, required: "always" },
  "meeting[category_id]": { kind: "select", options: "category", required: "always" },
  "meeting[subcategory_id]": { kind: "dependent-select", parent: "meeting[category_id]" },
  "meeting[start_time]": { kind: "datetime", required: "always" },
  "meeting[end_time]": { kind: "datetime", required: "always" },
  "meeting[tm_zone_info]": { kind: "select", options: "timezone", required: "always" },
  "meeting[description]": { kind: "richtext", maxLength: 8192, required: "always" },
  "meeting[header]": { kind: "richtext", maxLength: 512 },
  "meeting[footer]": { kind: "richtext", maxLength: 512 },
  "meeting[agenda]": { kind: "richtext", maxLength: 8192 },
  "meeting[keywords]": { kind: "text", multiline: true, maxLength: 512, required: "always" },
  "meeting[survey_url]": { kind: "text", format: "url", maxLength: 512 },

  // Location
  [LOCATION_TYPE_FIELD]: {
    kind: "radio",
    options: [
      { value: "virtual", label: "Virtual" },
      { value: "hybrid", label: "Hybrid" },
      { value: "physical", label: "In-Person" },
    ],
  },
  "meeting[virtual_info]": { kind: "richtext", appliesTo: ONLINE, required: "when-applicable" },
  "meeting[address1]": { kind: "text", maxLength: 128, appliesTo: IN_PERSON },
  "meeting[address2]": { kind: "text", maxLength: 128, appliesTo: IN_PERSON },
  "meeting[city]": { kind: "text", maxLength: 128, appliesTo: IN_PERSON, required: "when-applicable" },
  "meeting[country_id]": { kind: "select", options: "country", appliesTo: IN_PERSON, required: "when-applicable" },
  "meeting[state_id]": { kind: "dependent-select", parent: "meeting[country_id]", appliesTo: IN_PERSON },
  "meeting[postal_code]": { kind: "text", maxLength: 16, appliesTo: IN_PERSON },
  "meeting[building]": { kind: "text", maxLength: 128, appliesTo: IN_PERSON },
  "meeting[room_number]": { kind: "text", maxLength: 48, appliesTo: IN_PERSON },
  "meeting[map_url]": { kind: "text", format: "url", maxLength: 512, appliesTo: IN_PERSON },
  "meeting[user_override_latitude]": { kind: "number", integer: false, min: -90, max: 90, appliesTo: IN_PERSON },
  "meeting[user_override_longitude]": { kind: "number", integer: false, min: -180, max: 180, appliesTo: IN_PERSON },

  // Registration
  [REGISTRATION_TYPE_FIELD]: {
    kind: "radio",
    options: [
      { value: "Standard", label: "Standard" },
      { value: "Custom", label: "External" },
      { value: "None", label: "None" },
    ],
  },
  "meeting[reg_start_time]": { kind: "datetime", appliesTo: STANDARD_REG },
  "meeting[reg_end_time]": { kind: "datetime", appliesTo: STANDARD_REG },
  "meeting[max_registrations]": { kind: "number", integer: true, min: 0, max: 999, appliesTo: STANDARD_REG },
  "meeting[max_registrations_virtual]": { kind: "number", integer: true, min: 0, max: 999, appliesTo: STANDARD_REG },
  "meeting[require_terms]": { kind: "checkbox", appliesTo: STANDARD_REG },
  "meeting[registration_url]": {
    kind: "text",
    format: "url",
    maxLength: 512,
    appliesTo: { registration: ["Custom"] },
    required: "when-applicable",
  },

  // Report and attendance
  "meeting[ieee_attending]": { kind: "number", integer: true, min: 0 },
  "meeting[guests_attending]": { kind: "number", integer: true, min: 0 },
};

/** Per-speaker fields; the full name is speakers[speakerN][<key>] with N = 1, 2, 3, ... */
export const SPEAKER_FIELDS: Readonly<Record<string, FieldDef>> = {
  topic: { kind: "text", maxLength: 120 },
  dlp_speaker: { kind: "checkbox" },
  topic_description: { kind: "richtext" },
  prefix: { kind: "text", maxLength: 16 },
  first_name: { kind: "text", maxLength: 200 },
  middle_name: { kind: "text", maxLength: 200 },
  last_name: { kind: "text", maxLength: 200 },
  suffix: { kind: "text", maxLength: 32 },
  display_name: { kind: "text", maxLength: 256 },
  speaker_url: { kind: "text", format: "url", maxLength: 512 },
  address1: { kind: "text", maxLength: 128 },
  address2: { kind: "text", maxLength: 128 },
  city: { kind: "text", maxLength: 128 },
  country_id: { kind: "select", options: "country" },
  state_id: { kind: "dependent-select", parent: "country_id" },
  postal_code: { kind: "text", maxLength: 64 },
  email: { kind: "text", format: "email", maxLength: 128 },
  biography: { kind: "richtext", maxLength: 8192 },
  organization: { kind: "text", maxLength: 256 },
};

const SPEAKER_KEY = /^speakers\[speaker([1-9]\d*)\]\[([a-z_]+)\]$/;

export class UnknownFieldError extends Error {
  constructor(readonly fieldName: string) {
    super(`${JSON.stringify(fieldName)} is not a field this tool can fill on the Create Event form`);
    this.name = "UnknownFieldError";
  }
}

export class NotASpeakerKeyError extends Error {
  constructor(readonly fieldName: string) {
    super(`${JSON.stringify(fieldName)} is not a speaker field name like speakers[speaker1][topic]`);
    this.name = "NotASpeakerKeyError";
  }
}

function assertName(name: unknown): asserts name is string {
  if (typeof name !== "string") throw new TypeError(`name must be a string, got ${JSON.stringify(name)}`);
}

/** True for speakers[speakerN][prop] with N a positive whole number small enough to be real. */
export function isSpeakerKey(name: string): boolean {
  assertName(name);
  const m = SPEAKER_KEY.exec(name);
  return m !== null && Number.isSafeInteger(Number(m[1]));
}

/** Splits speakers[speakerN][prop]; throws NotASpeakerKeyError for anything else. */
export function parseSpeakerKey(name: string): { index: number; prop: string } {
  if (!isSpeakerKey(name)) throw new NotASpeakerKeyError(name);
  const [, index, prop] = SPEAKER_KEY.exec(name)!;
  return { index: Number(index), prop: prop! };
}

export function isKnownField(name: string): boolean {
  assertName(name);
  if (Object.hasOwn(MEETING_FIELDS, name)) return true;
  return isSpeakerKey(name) && Object.hasOwn(SPEAKER_FIELDS, parseSpeakerKey(name).prop);
}

/** Throws UnknownFieldError when the name is not a field this tool fills. */
export function lookupField(name: string): FieldDef {
  if (!isKnownField(name)) throw new UnknownFieldError(name);
  if (Object.hasOwn(MEETING_FIELDS, name)) return MEETING_FIELDS[name]!;
  return SPEAKER_FIELDS[parseSpeakerKey(name).prop]!;
}

/** The select whose choice loads a dependent select's options, e.g. country for state. */
export function parentFieldOf(name: string): string {
  const def = lookupField(name);
  if (def.kind !== "dependent-select") throw new TypeError(`${name} is not a dependent select`);
  if (!isSpeakerKey(name)) return def.parent;
  return `speakers[speaker${parseSpeakerKey(name).index}][${def.parent}]`;
}
