import { InvalidDateTimeError, parseVtoolsDateTime } from "../format/vtoolsDate";
import {
  LOCATION_TYPE_FIELD,
  MEETING_FIELDS,
  REGISTRATION_TYPE_FIELD,
  isKnownField,
  isSpeakerKey,
  lookupField,
  parentFieldOf,
  parseSpeakerKey,
  type CatalogKey,
  type FieldDef,
  type LocationType,
  type RegistrationType,
} from "./fields";
import {
  OptionResolutionError,
  checkOptionInput,
  resolveOption,
  type OptionResolutionReason,
  type SelectOption,
} from "./resolveOption";

export type OptionCatalog = Readonly<Record<CatalogKey, readonly SelectOption[]>>;

export type ValidationRule =
  | "type"
  | "unknown-field"
  | "required"
  | "not-applicable"
  | "max-length"
  | "format"
  | "range"
  | "option"
  | "date-order"
  | "max-duration"
  | "speaker-numbering";

export interface ValidationIssue {
  field: string;
  rule: ValidationRule;
  message: string;
  reason?: OptionResolutionReason;
}

export interface ValidatedEvent {
  /** Field name → value ready for the page: select/radio IDs resolved, numbers as strings. */
  values: Readonly<Record<string, string | boolean>>;
  locationType: LocationType;
  registrationType: RegistrationType;
}

/** Thrown whenever the input mentions publishing. Deliberately not an EventValidationError. */
export class PublishForbiddenError extends Error {
  constructor(readonly key: string) {
    super(
      `"${key}" is not allowed: this tool never publishes. Events are only filled in and left ` +
        `for you to review and save as a draft yourself. Remove the key and try again.`,
    );
    this.name = "PublishForbiddenError";
  }
}

export class EventValidationError extends Error {
  constructor(readonly issues: ValidationIssue[]) {
    super(`Event JSON has ${issues.length} problem(s):\n` + issues.map((i) => `- ${i.field}: ${i.message}`).join("\n"));
    this.name = "EventValidationError";
  }
}

const MAX_EVENT_MS = 5 * 24 * 60 * 60 * 1000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SINGLE_LINE_CONTROL = /[\u0000-\u001f\u007f]/;
/** Same, but allows tab, line feed, and carriage return. */
const MULTI_LINE_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const SCRIPT_TAG = /<\s*script\b/i;

const isPlainObject = (v: unknown): v is Record<string, unknown> => {
  if (typeof v !== "object" || v === null) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

const isBlank = (v: unknown) => v === undefined || (typeof v === "string" && v.trim() === "");

function findPublishKeys(value: unknown, seen: WeakSet<object>): void {
  if (typeof value !== "object" || value === null || seen.has(value)) return;
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (key.replace(/\s/g, "").toLowerCase().includes("publish")) throw new PublishForbiddenError(key);
    findPublishKeys(child, seen);
  }
}

/**
 * Throws PublishForbiddenError if any key anywhere in the value mentions publishing, ignoring
 * case and spaces. Any value is acceptable input; only publish keys are rejected.
 */
export function assertNoPublishKeys(value: unknown): void {
  findPublishKeys(value, new WeakSet());
}

function assertCatalog(catalog: unknown): asserts catalog is OptionCatalog {
  const keys: CatalogKey[] = ["category", "timezone", "country"];
  if (typeof catalog !== "object" || catalog === null || !keys.every((k) => Array.isArray((catalog as never)[k]))) {
    throw new TypeError(`catalog must be an object with ${keys.join(", ")} option arrays`);
  }
}

function isHttpUrl(text: string): boolean {
  try {
    const { protocol } = new URL(text);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/** Checks one value against its definition; returns the page-ready value or an issue. */
function checkValue(
  field: string,
  def: FieldDef,
  raw: unknown,
  catalog: OptionCatalog,
): string | boolean | Omit<ValidationIssue, "field"> {
  const tooLong = (s: string) =>
    def.maxLength !== undefined && s.length > def.maxLength
      ? { rule: "max-length" as const, message: `is ${s.length} characters; the maximum is ${def.maxLength}` }
      : null;

  try {
    switch (def.kind) {
      case "checkbox":
        return typeof raw === "boolean" ? raw : { rule: "type", message: "must be true or false" };

      case "select":
        return resolveOption(field, raw, catalog[def.options]);

      case "radio":
        return resolveOption(field, raw, def.options);

      case "dependent-select":
        return checkOptionInput(field, raw);

      case "number": {
        const text = typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw.trim() : null;
        if (text === null) return { rule: "type", message: "must be a number" };
        const pattern = def.integer ? /^-?\d+$/ : /^-?\d+(\.\d+)?$/;
        if (!pattern.test(text)) {
          return { rule: "format", message: `must be a ${def.integer ? "whole number" : "number"}` };
        }
        const n = Number(text);
        if (def.integer && !Number.isSafeInteger(n)) {
          return { rule: "range", message: "is too large to be a whole number" };
        }
        if (n < def.min || (def.max !== undefined && n > def.max)) {
          return { rule: "range", message: `must be between ${def.min} and ${def.max ?? "∞"}` };
        }
        return String(n);
      }

      case "datetime":
        if (typeof raw !== "string") return { rule: "type", message: "must be a string" };
        if (!isBlank(raw)) parseVtoolsDateTime(raw);
        return raw;

      case "ou-picker":
      case "richtext":
      case "text": {
        if (typeof raw !== "string") return { rule: "type", message: "must be a string" };
        const longIssue = tooLong(raw);
        if (longIssue) return longIssue;
        const multiline = def.kind === "richtext" || (def.kind === "text" && def.multiline === true);
        if ((multiline ? MULTI_LINE_CONTROL : SINGLE_LINE_CONTROL).test(raw)) {
          return {
            rule: "format",
            message: multiline
              ? "contains control characters (only tabs and line breaks are allowed)"
              : "contains control characters such as line breaks or tabs",
          };
        }
        if (def.kind === "richtext" && SCRIPT_TAG.test(raw)) {
          return { rule: "format", message: "contains a <script> tag, which vTools strips out" };
        }
        if (def.kind === "text" && def.format && !isBlank(raw)) {
          const trimmed = raw.trim();
          if (def.format === "email" && !EMAIL.test(trimmed)) {
            return { rule: "format", message: "must be an email address" };
          }
          if (def.format === "url" && !isHttpUrl(trimmed)) {
            return { rule: "format", message: "must be an http:// or https:// URL" };
          }
          return trimmed;
        }
        return raw;
      }
    }
  } catch (e) {
    if (e instanceof OptionResolutionError) return { rule: "option", message: e.message, reason: e.reason };
    if (e instanceof InvalidDateTimeError) return { rule: "format", message: e.message };
    throw e;
  }
}

/**
 * Validates one event's JSON (keys are the form's HTML field names) and resolves labels to IDs.
 * Throws PublishForbiddenError if publishing is mentioned anywhere, otherwise collects every
 * problem and throws a single EventValidationError.
 */
export function validateEvent(input: unknown, catalog: OptionCatalog): ValidatedEvent {
  assertNoPublishKeys(input);
  assertCatalog(catalog);

  if (!isPlainObject(input)) {
    throw new EventValidationError([
      { field: "(root)", rule: "type", message: "must be a JSON object of field names to values" },
    ]);
  }

  const issues: ValidationIssue[] = [];
  const values: Record<string, string | boolean> = {};
  const defs = new Map<string, FieldDef>();

  for (const [field, raw] of Object.entries(input)) {
    if (!isKnownField(field)) {
      issues.push({ field, rule: "unknown-field", message: "is not a field this tool can fill on the Create Event form" });
      continue;
    }
    const def = lookupField(field);
    defs.set(field, def);
    const result = checkValue(field, def, raw, catalog);
    if (typeof result === "object") issues.push({ field, ...result });
    else values[field] = result;
  }

  const locationType = (values[LOCATION_TYPE_FIELD] ?? "physical") as LocationType;
  const registrationType = (values[REGISTRATION_TYPE_FIELD] ?? "Standard") as RegistrationType;
  const applies = (def: FieldDef) =>
    (!def.appliesTo?.location || def.appliesTo.location.includes(locationType)) &&
    (!def.appliesTo?.registration || def.appliesTo.registration.includes(registrationType));
  const hasIssue = (field: string) => issues.some((i) => i.field === field);

  for (const [field, def] of defs) {
    if (!applies(def)) {
      issues.push({
        field,
        rule: "not-applicable",
        message: `does not apply to a ${locationType} event with ${registrationType} registration; remove it`,
      });
    }
  }

  const requiredFields = new Set([
    ...Object.keys(input),
    ...Object.keys(MEETING_FIELDS).filter((f) => MEETING_FIELDS[f]!.required),
  ]);
  for (const field of requiredFields) {
    if (!isKnownField(field)) continue;
    const def = lookupField(field);
    if (!def.required || hasIssue(field)) continue;
    const needed = def.required === "always" || applies(def);
    if (needed && isBlank(input[field])) issues.push({ field, rule: "required", message: "is required" });
  }

  for (const [field, def] of defs) {
    if (def.kind !== "dependent-select") continue;
    const parent = parentFieldOf(field);
    if (isBlank(input[parent]) && !hasIssue(parent)) {
      issues.push({ field: parent, rule: "required", message: `is required when ${field} is given` });
    }
  }

  checkSpeakerNames(input, issues);
  checkSpeakerNumbering(input, issues);
  checkDates(values, issues);

  if (issues.length > 0) throw new EventValidationError(issues);
  const result: ValidatedEvent = Object.freeze({ values: Object.freeze(values), locationType, registrationType });
  validatedEvents.add(result);
  return result;
}

const validatedEvents = new WeakSet<object>();

/** True only for the exact (frozen) objects returned by validateEvent. */
export function isValidatedEvent(value: unknown): value is ValidatedEvent {
  return typeof value === "object" && value !== null && validatedEvents.has(value);
}

function checkSpeakerNames(input: Record<string, unknown>, issues: ValidationIssue[]) {
  const speakers = new Set<number>();
  for (const key of Object.keys(input)) {
    if (isSpeakerKey(key)) speakers.add(parseSpeakerKey(key).index);
  }
  for (const n of speakers) {
    const f = (prop: string) => `speakers[speaker${n}][${prop}]`;
    const hasName = !isBlank(input[f("first_name")]) || !isBlank(input[f("last_name")]);
    if (hasName && isBlank(input[f("display_name")]) && !issues.some((i) => i.field === f("display_name"))) {
      issues.push({ field: f("display_name"), rule: "required", message: "is required when a first or last name is given" });
    }
  }
}

/** Gaps longer than this are reported as one range instead of one issue per number. */
const MAX_LISTED_MISSING_SPEAKERS = 10;

/** Speakers with any non-blank value must be numbered 1, 2, 3, ... with no gaps. */
function checkSpeakerNumbering(input: Record<string, unknown>, issues: ValidationIssue[]) {
  const present = new Set<number>();
  for (const [key, value] of Object.entries(input)) {
    if (isSpeakerKey(key) && !isBlank(value)) present.add(parseSpeakerKey(key).index);
  }

  const rule = "speakers must be numbered 1, 2, 3, ... without gaps";
  let expected = 1;
  for (const index of [...present].sort((a, b) => a - b)) {
    const last = index - 1;
    if (last - expected + 1 > MAX_LISTED_MISSING_SPEAKERS) {
      issues.push({
        field: `speakers[speaker${expected}]`,
        rule: "speaker-numbering",
        message: `speakers ${expected} to ${last} are missing; ${rule}`,
      });
    } else {
      for (let n = expected; n <= last; n++) {
        issues.push({ field: `speakers[speaker${n}]`, rule: "speaker-numbering", message: `speaker ${n} is missing; ${rule}` });
      }
    }
    expected = index + 1;
  }
}

function checkDates(values: Record<string, string | boolean>, issues: ValidationIssue[]) {
  // values only holds date/times checkValue already parsed successfully; blank means "not given".
  const given = (field: string) => typeof values[field] === "string" && !isBlank(values[field]);
  const at = (field: string) => parseVtoolsDateTime(values[field] as string);

  if (given("meeting[start_time]") && given("meeting[end_time]")) {
    const start = at("meeting[start_time]");
    const end = at("meeting[end_time]");
    if (end <= start) {
      issues.push({ field: "meeting[end_time]", rule: "date-order", message: "must be after the start time" });
    } else if (end - start > MAX_EVENT_MS) {
      issues.push({ field: "meeting[end_time]", rule: "max-duration", message: "is more than 5 days after the start time" });
    }
  }

  if (given("meeting[reg_start_time]") && given("meeting[reg_end_time]")) {
    if (at("meeting[reg_end_time]") <= at("meeting[reg_start_time]")) {
      issues.push({ field: "meeting[reg_end_time]", rule: "date-order", message: "must be after registration starts" });
    }
  }
}
