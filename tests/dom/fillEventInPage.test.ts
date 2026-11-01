import { describe, expect, it } from "vitest";
import { PAGE_API_KEY, fillEventInPage, installPageApi } from "../../src/page/fillEventInPage";
import type { FillOutcome } from "../../src/page/outcome";
import { loadFakePage, type FakePage } from "./fakePage";

const FAST = { timeoutMs: 300, pollMs: 5 };

const event: Record<string, unknown> = {
  "meeting[meeting_host][0][spoid]": "STB13781",
  "meeting[meeting_host][0][contact_email]": "branch@example.org",
  "meeting[title]": "Embedded Systems Workshop",
  "meeting[category_id]": "Technical",
  "meeting[start_time]": "10 Nov 2026 06:00 PM",
  "meeting[end_time]": "10 Nov 2026 08:00 PM",
  "meeting[tm_zone_info]": "Mountain Time (US & Canada)",
  "meeting[description]": "<p>Hands-on intro.</p>",
  "meeting[keywords]": "embedded workshop",
  "meeting[city]": "Example City",
  "meeting[country_id]": "United States",
};

const title = (page: FakePage) => (page.document.getElementsByName("meeting[title]")[0] as HTMLInputElement).value;
const roundTrips = (outcome: FillOutcome) => expect(JSON.parse(JSON.stringify(outcome))).toEqual(outcome);

describe("fillEventInPage", () => {
  it("fills the page and reports the step counts", async () => {
    const page = loadFakePage();
    const outcome = await fillEventInPage(event, page.vtoolsWindow, FAST);
    expect(outcome).toEqual({ status: "filled", stepsCompleted: 17, totalSteps: 17 });
    expect(title(page)).toBe("Embedded Systems Workshop");
    roundTrips(outcome);
  });

  it("reports validation problems against the page's own option lists without filling anything", async () => {
    const page = loadFakePage();
    const outcome = await fillEventInPage({ ...event, "meeting[country_id]": "Atlantis", "meeting[title]": "" }, page.vtoolsWindow, FAST);
    expect(outcome.status).toBe("invalid");
    expect(outcome).toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({ field: "meeting[title]", rule: "required" }),
        expect.objectContaining({ field: "meeting[country_id]", rule: "option", reason: "unknown-label" }),
      ]),
    });
    expect(title(page)).toBe("");
    roundTrips(outcome);
  });

  it("refuses publish keys without filling anything", async () => {
    const page = loadFakePage();
    const outcome = await fillEventInPage({ ...event, "meeting[publish]": false }, page.vtoolsWindow, FAST);
    expect(outcome).toMatchObject({ status: "publish-forbidden", message: expect.stringMatching(/never publishes/) });
    expect(title(page)).toBe("");
    roundTrips(outcome);
  });

  it("reports the failing step", async () => {
    const page = loadFakePage({ states: {} });
    const outcome = await fillEventInPage({ ...event, "meeting[state_id]": "Colorado" }, page.vtoolsWindow, FAST);
    expect(outcome).toMatchObject({
      status: "step-failed",
      totalSteps: 18,
      step: { kind: "set-dependent-select", name: "meeting[state_id]" },
      message: expect.stringMatching(/^Step \d+ of 18/),
    });
    roundTrips(outcome);
  });

  it("refuses to fill when the publish checkbox is checked", async () => {
    const page = loadFakePage();
    page.document.querySelector<HTMLInputElement>("#meeting_publish")!.checked = true;
    const outcome = await fillEventInPage(event, page.vtoolsWindow, FAST);
    expect(outcome.status).toBe("unsafe-page");
    expect(title(page)).toBe("");
    roundTrips(outcome);
  });

  it.each([
    ["the form is missing", (page: FakePage) => page.document.getElementById("_events_form")!.remove()],
    ["the form posts somewhere else", (page: FakePage) => page.document.getElementById("_events_form")!.setAttribute("action", "/tego_/event/edit/5")],
  ])("reports the wrong page when %s", async (_label, breakPage) => {
    const page = loadFakePage();
    breakPage(page);
    const outcome = await fillEventInPage(event, page.vtoolsWindow, FAST);
    expect(outcome).toMatchObject({ status: "wrong-page", message: expect.stringMatching(/Create Event/) });
    roundTrips(outcome);
  });

  it("reports an unusable window as an error outcome instead of throwing across the page boundary", async () => {
    const outcome = await fillEventInPage(event, {} as never, FAST);
    expect(outcome).toMatchObject({ status: "error", name: "TypeError", message: expect.stringMatching(/window must/) });
    roundTrips(outcome);
  });

  it("refuses a second run while one is in progress, then allows a new one", async () => {
    const page = loadFakePage();
    const first = fillEventInPage(event, page.vtoolsWindow, FAST);
    const second = await fillEventInPage(event, page.vtoolsWindow, FAST);
    expect(second).toMatchObject({ status: "busy" });
    expect((await first).status).toBe("filled");
    expect((await fillEventInPage(event, page.vtoolsWindow, FAST)).status).toBe("filled");
  });
});

describe("installPageApi", () => {
  it("exposes a fill function on the window that fills the page", async () => {
    const page = loadFakePage();
    installPageApi(page.vtoolsWindow, FAST);
    const api = (page.vtoolsWindow as unknown as Record<string, { fill(input: unknown): Promise<FillOutcome> }>)[PAGE_API_KEY]!;
    expect((await api.fill(event)).status).toBe("filled");
  });

  it("cannot be overwritten, and installing twice keeps the first", () => {
    const page = loadFakePage();
    installPageApi(page.vtoolsWindow, FAST);
    const win = page.vtoolsWindow as unknown as Record<string, unknown>;
    const first = win[PAGE_API_KEY];
    installPageApi(page.vtoolsWindow, FAST);
    expect(win[PAGE_API_KEY]).toBe(first);
    expect(() => {
      "use strict";
      win[PAGE_API_KEY] = { fill: () => "hijacked" };
    }).toThrow(TypeError);
    expect(Object.isFrozen(first)).toBe(true);
  });

  it.each([null, undefined, "window"])("throws TypeError for %j", (win) => {
    expect(() => installPageApi(win as never)).toThrow(/window must be an object/);
  });
});
