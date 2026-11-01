const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const PATTERN = /^(\d{2}) ([A-Z][a-z]{2}) (\d{4}) (\d{2}):(\d{2}) (AM|PM)$/;

export const VTOOLS_DATE_EXAMPLE = "10 Nov 2026 06:00 PM";

/**
 * Parses the vTools date picker format "DD MMM YYYY hh:mm A" into a wall-clock timestamp
 * (milliseconds, as if the time were UTC). Only useful for comparing times within one event,
 * which all share the event's time zone. Returns null for anything not in that exact format.
 */
export function parseVtoolsDateTime(text: string): number | null {
  const m = PATTERN.exec(text);
  if (!m) return null;
  const [, dd, mon, yyyy, hh, mm, ampm] = m;
  const month = MONTHS.indexOf(mon!);
  const day = Number(dd);
  const year = Number(yyyy);
  const hour12 = Number(hh);
  const minute = Number(mm);
  if (month < 0 || hour12 < 1 || hour12 > 12 || minute > 59) return null;

  const hour = (hour12 % 12) + (ampm === "PM" ? 12 : 0);
  const ms = Date.UTC(year, month, day, hour, minute);
  // Date.UTC rolls 31 Feb over into March; reject instead.
  if (new Date(ms).getUTCDate() !== day) return null;
  return ms;
}
