import { describe, expect, it } from "vitest";
import { NotCreateEventPageError, assertCreateEventPage } from "../../src/popup/pageTarget";

describe("assertCreateEventPage", () => {
  it.each([
    "https://events.vtools.ieee.org/tego_/event/create",
    "https://events.vtools.ieee.org/tego_/event/create?from=menu",
    "https://events.vtools.ieee.org/tego_/event/create#_event_host",
    "https://EVENTS.vtools.ieee.org/tego_/event/create",
  ])("accepts %s", (url) => {
    expect(() => assertCreateEventPage(url)).not.toThrow();
  });

  it.each([
    "http://events.vtools.ieee.org/tego_/event/create",
    "https://events.vtools.ieee.org/tego_/event/edit/123",
    "https://events.vtools.ieee.org/tego_/event/create/extra",
    "https://events.vtools.ieee.org/tego_/event/create/",
    "https://events.vtools.ieee.org/",
    "https://events.vtools.ieee.org.evil.com/tego_/event/create",
    "https://evil.com/events.vtools.ieee.org/tego_/event/create",
    "https://events.vtools.ieee.org@evil.com/tego_/event/create",
    "https://user@events.vtools.ieee.org/tego_/event/create",
    "https://events.vtools.ieee.org:8443/tego_/event/create",
    "chrome://extensions",
    "not a url",
    "",
  ])("rejects %j, naming the URL", (url) => {
    let error: unknown;
    try {
      assertCreateEventPage(url);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(NotCreateEventPageError);
    expect((error as NotCreateEventPageError).url).toBe(url);
    expect((error as Error).message).toMatch(/Create Event page/);
  });

  it.each([null, undefined, 5, {}])("throws TypeError for the non-string %j", (url) => {
    expect(() => assertCreateEventPage(url as string)).toThrow(/url must be a string/);
  });
});
