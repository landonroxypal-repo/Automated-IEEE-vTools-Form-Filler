const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const PATTERN = /^(\d{2}) ([A-Z][a-z]{2}) (\d{4}) (\d{2}):(\d{2}) (AM|PM)$/;
const MIN_YEAR = 2000;
const MAX_YEAR = 2099;

export const VTOOLS_DATE_EXAMPLE = "10 Nov 2026 06:00 PM";

export type InvalidDateTimeReason = "type" | "format" | "out-of-range";

export class InvalidDateTimeError extends Error {
  constructor(
    readonly input: unknown,
    readonly reason: InvalidDateTimeReason,
    detail: string,
  ) {
    super(`${JSON.stringify(input) ?? String(input)} ${detail}`);
    this.name = "InvalidDateTimeError";
  }
}

/**
 * Parses the vTools date picker format "DD MMM YYYY hh:mm A" into a wall-clock timestamp
 * (milliseconds, as if the time were UTC). Only useful for comparing times within one event,
 * which all share the event's time zone. Throws InvalidDateTimeError for anything else.
 */
export function parseVtoolsDateTime(text: string): number {
  if (typeof text !== "string") {
    throw new InvalidDateTimeError(text, "type", `is not a string; expected a date/time like "${VTOOLS_DATE_EXAMPLE}"`);
  }
  const m = PATTERN.exec(text);
  if (!m) {
    throw new InvalidDateTimeError(text, "format", `is not in the format "DD MMM YYYY hh:mm AM/PM", e.g. "${VTOOLS_DATE_EXAMPLE}"`);
  }
  const [, dd, mon, yyyy, hh, mm, ampm] = m;
  const outOfRange = (what: string) => new InvalidDateTimeError(text, "out-of-range", `has an invalid ${what}`);

  const month = MONTHS.indexOf(mon!);
  if (month < 0) throw outOfRange(`month "${mon}" (use Jan, Feb, ... Dec)`);
  const year = Number(yyyy);
  if (year < MIN_YEAR || year > MAX_YEAR) throw outOfRange(`year ${yyyy} (supported: ${MIN_YEAR}-${MAX_YEAR})`);
  const hour12 = Number(hh);
  if (hour12 < 1 || hour12 > 12) throw outOfRange(`hour ${hh} (use 01-12 with AM/PM)`);
  const minute = Number(mm);
  if (minute > 59) throw outOfRange(`minute ${mm}`);

  const day = Number(dd);
  const hour = (hour12 % 12) + (ampm === "PM" ? 12 : 0);
  const ms = Date.UTC(year, month, day, hour, minute);
  // Date.UTC rolls 31 Feb over into March (and day 00 back into the previous month); reject instead.
  if (day < 1 || new Date(ms).getUTCDate() !== day) throw outOfRange(`day ${dd} for ${mon} ${yyyy}`);
  return ms;
}
