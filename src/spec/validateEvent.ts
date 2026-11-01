import { parseVtoolsDateTime, VTOOLS_DATE_EXAMPLE } from "../format/vtoolsDate";
import {
  LOCATION_TYPE_FIELD,
  MEETING_FIELDS,
  REGISTRATION_TYPE_FIELD,
  lookupField,
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
  | "max-duration";

export interface ValidationIssue {
  field: string;
  rule: ValidationRule;
  message: string;
  reason?: OptionResolutionReason;
}

export interface ValidatedEvent {
  /** Field name → value ready for the page: select/radio IDs resolved, numbers as strings. */
  values: Record<string, string | boolean>;
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

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isBlank = (v: unknown) => v === undefined || (typeof v === "string" && v.trim() === "");

function assertNoPublish(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(assertNoPublish);
  } else if (isPlainObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (key.replace(/\s/g, "").toLowerCase().includes("publish")) throw new PublishForbiddenError(key);
      assertNoPublish(child);
    }
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
        if (n < def.min || (def.max !== undefined && n > def.max)) {
          return { rule: "range", message: `must be between ${def.min} and ${def.max ?? "∞"}` };
        }
        return text;
      }

      case "datetime":
        if (typeof raw !== "string") return { rule: "type", message: "must be a string" };
        if (!isBlank(raw) && parseVtoolsDateTime(raw) === null) {
          return { rule: "format", message: `must look like "${VTOOLS_DATE_EXAMPLE}"` };
        }
        return raw;

      case "ou-picker":
      case "richtext":
      case "text": {
        if (typeof raw !== "string") return { rule: "type", message: "must be a string" };
        const longIssue = tooLong(raw);
        if (longIssue) return longIssue;
        if (def.kind === "text" && def.format && !isBlank(raw)) {
          if (def.format === "email" && !EMAIL.test(raw.trim())) {
            return { rule: "format", message: "must be an email address" };
          }
          if (def.format === "url" && !isHttpUrl(raw.trim())) {
            return { rule: "format", message: "must be an http:// or https:// URL" };
          }
        }
        return raw;
      }
    }
  } catch (e) {
    if (e instanceof OptionResolutionError) return { rule: "option", message: e.message, reason: e.reason };
    throw e;
  }
}

/**
 * Validates one event's JSON (keys are the form's HTML field names) and resolves labels to IDs.
 * Throws PublishForbiddenError if publishing is mentioned anywhere, otherwise collects every
 * problem and throws a single EventValidationError.
 */
export function validateEvent(input: unknown, catalog: OptionCatalog): ValidatedEvent {
  assertNoPublish(input);

  if (!isPlainObject(input)) {
    throw new EventValidationError([
      { field: "(root)", rule: "type", message: "must be a JSON object of field names to values" },
    ]);
  }

  const issues: ValidationIssue[] = [];
  const values: Record<string, string | boolean> = {};
  const defs = new Map<string, FieldDef>();

  for (const [field, raw] of Object.entries(input)) {
    const def = lookupField(field);
    if (!def) {
      issues.push({ field, rule: "unknown-field", message: "is not a field this tool can fill on the Create Event form" });
      continue;
    }
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
    const def = lookupField(field);
    if (!def?.required || hasIssue(field)) continue;
    const needed = def.required === "always" || applies(def);
    if (needed && isBlank(input[field])) issues.push({ field, rule: "required", message: "is required" });
  }

  checkSpeakerNames(input, issues);
  checkDates(values, issues);

  if (issues.length > 0) throw new EventValidationError(issues);
  return { values, locationType, registrationType };
}

function checkSpeakerNames(input: Record<string, unknown>, issues: ValidationIssue[]) {
  const speakers = new Set<number>();
  for (const key of Object.keys(input)) {
    const s = parseSpeakerKey(key);
    if (s) speakers.add(s.index);
  }
  for (const n of speakers) {
    const f = (prop: string) => `speakers[speaker${n}][${prop}]`;
    const hasName = !isBlank(input[f("first_name")]) || !isBlank(input[f("last_name")]);
    if (hasName && isBlank(input[f("display_name")]) && !issues.some((i) => i.field === f("display_name"))) {
      issues.push({ field: f("display_name"), rule: "required", message: "is required when a first or last name is given" });
    }
  }
}

function checkDates(values: Record<string, string | boolean>, issues: ValidationIssue[]) {
  const time = (field: string) => {
    const v = values[field];
    return typeof v === "string" ? parseVtoolsDateTime(v) : null;
  };

  const start = time("meeting[start_time]");
  const end = time("meeting[end_time]");
  if (start !== null && end !== null) {
    if (end <= start) {
      issues.push({ field: "meeting[end_time]", rule: "date-order", message: "must be after the start time" });
    } else if (end - start > MAX_EVENT_MS) {
      issues.push({ field: "meeting[end_time]", rule: "max-duration", message: "is more than 5 days after the start time" });
    }
  }

  const regStart = time("meeting[reg_start_time]");
  const regEnd = time("meeting[reg_end_time]");
  if (regStart !== null && regEnd !== null && regEnd <= regStart) {
    issues.push({ field: "meeting[reg_end_time]", rule: "date-order", message: "must be after registration starts" });
  }
}
