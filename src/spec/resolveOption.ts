export interface SelectOption {
  value: string;
  label: string;
}

export type OptionResolutionReason =
  | "empty"
  | "invalid-type"
  | "negative-id"
  | "unknown-id"
  | "unknown-label"
  | "ambiguous-label";

export class OptionResolutionError extends Error {
  /** The message without the field name, for places that already show the field. */
  readonly detail: string;

  constructor(
    readonly field: string,
    readonly input: unknown,
    readonly reason: OptionResolutionReason,
    detail: string,
  ) {
    const withoutField = `${JSON.stringify(input)} ${detail}`;
    super(`${field}: ${withoutField}`);
    this.detail = withoutField;
    this.name = "OptionResolutionError";
  }
}

const UTC_PREFIX = /^\(UTC[+-]\d{2}:\d{2}\)\s*/i;
const INTEGER = /^-?\d+$/;

const normalize = (label: string) => label.trim().toLowerCase();

function assertFieldName(field: unknown): asserts field is string {
  if (typeof field !== "string" || field.trim() === "") {
    throw new TypeError(`field must be a non-empty string, got ${JSON.stringify(field)}`);
  }
}

function assertOptions(options: unknown): asserts options is readonly SelectOption[] {
  const valid =
    Array.isArray(options) &&
    options.every(
      (o) => typeof o === "object" && o !== null && typeof o.value === "string" && typeof o.label === "string",
    );
  if (!valid) throw new TypeError("options must be an array of { value: string, label: string }");
}

/**
 * The checks that don't need the option list: type, emptiness, and negative IDs.
 * Returns the trimmed text form of the input. Used on its own for selects whose options
 * are only loaded later by the page (state, sub-category).
 */
export function checkOptionInput(field: string, input: unknown): string {
  assertFieldName(field);
  let text: string;
  if (typeof input === "number") {
    if (!Number.isSafeInteger(input)) {
      throw new OptionResolutionError(field, input, "invalid-type", "is not a whole-number ID");
    }
    text = String(input);
  } else if (typeof input === "string") {
    text = input.trim();
  } else {
    throw new OptionResolutionError(field, input, "invalid-type", "must be a string label or a numeric ID");
  }

  if (text === "") {
    throw new OptionResolutionError(field, input, "empty", "is empty; remove the key to leave the field blank");
  }

  if (INTEGER.test(text) && text.startsWith("-")) {
    throw new OptionResolutionError(field, input, "negative-id", "is a negative ID; IDs are never negative");
  }
  return text;
}

/**
 * Resolves a JSON value for a <select> field to the option value the site expects.
 * Accepts either an option value (ID) or a visible label; anything else throws, so a bad
 * value can never be silently skipped or replaced with a default.
 * Options with an empty value are placeholders ("Select one ...") and are never selectable.
 */
export function resolveOption(field: string, input: unknown, options: readonly SelectOption[]): string {
  assertOptions(options);
  const text = checkOptionInput(field, input);
  const selectable = options.filter((o) => o.value !== "");

  if (INTEGER.test(text)) {
    if (selectable.some((o) => o.value === text)) return text;
    throw new OptionResolutionError(field, input, "unknown-id", "is not one of this field's option IDs");
  }

  if (selectable.some((o) => o.value === text)) return text;

  const wanted = normalize(text);
  const matches = new Set<string>();
  for (const o of selectable) {
    const full = normalize(o.label);
    if (full === wanted || full.replace(UTC_PREFIX, "") === wanted) matches.add(o.value);
  }

  if (matches.size === 1) return [...matches][0]!;
  if (matches.size > 1) {
    throw new OptionResolutionError(
      field,
      input,
      "ambiguous-label",
      `matches several options (${[...matches].join(", ")}); use the ID instead`,
    );
  }
  throw new OptionResolutionError(field, input, "unknown-label", "does not match any option label");
}
