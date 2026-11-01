export const CREATE_EVENT_URL = "https://events.vtools.ieee.org/tego_/event/create";

export class NotCreateEventPageError extends Error {
  constructor(readonly url: string) {
    super(`This tab is not the vTools Create Event page (${CREATE_EVENT_URL}); it is ${JSON.stringify(url)}`);
    this.name = "NotCreateEventPageError";
  }
}

/**
 * Throws unless the URL is exactly the vTools Create Event page over https (query and fragment
 * allowed). Compares parsed parts, so look-alike hosts, credentials, and ports are rejected.
 */
export function assertCreateEventPage(url: string): void {
  if (typeof url !== "string") throw new TypeError(`url must be a string, got ${typeof url}`);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new NotCreateEventPageError(url);
  }
  const expected = new URL(CREATE_EVENT_URL);
  const matches =
    parsed.protocol === expected.protocol &&
    parsed.username === "" &&
    parsed.password === "" &&
    parsed.host === expected.host &&
    parsed.pathname === expected.pathname;
  if (!matches) throw new NotCreateEventPageError(url);
}
