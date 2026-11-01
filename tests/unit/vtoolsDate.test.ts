import { describe, expect, it } from "vitest";
import { parseVtoolsDateTime } from "../../src/format/vtoolsDate";

const HOUR = 60 * 60 * 1000;

describe("parseVtoolsDateTime", () => {
  it("parses the vTools display format", () => {
    expect(parseVtoolsDateTime("10 Nov 2026 06:00 PM")).toBe(Date.UTC(2026, 10, 10, 18, 0));
  });

  it("treats 12:xx AM as midnight and 12:xx PM as noon", () => {
    expect(parseVtoolsDateTime("01 Jan 2027 12:30 AM")).toBe(Date.UTC(2027, 0, 1, 0, 30));
    expect(parseVtoolsDateTime("01 Jan 2027 12:30 PM")).toBe(Date.UTC(2027, 0, 1, 12, 30));
  });

  it("orders times correctly across the AM/PM boundary", () => {
    const am = parseVtoolsDateTime("10 Nov 2026 11:00 AM")!;
    const pm = parseVtoolsDateTime("10 Nov 2026 01:00 PM")!;
    expect(pm - am).toBe(2 * HOUR);
  });

  it.each([
    "2026-11-10 18:00",
    "10 Nov 2026 18:00",
    "10 Nov 2026 13:00 PM",
    "10 Nov 2026 00:00 AM",
    "1 Nov 2026 06:00 PM",
    "10 November 2026 06:00 PM",
    "31 Feb 2026 10:00 AM",
    "10 Nov 2026 06:60 PM",
    "",
  ])("rejects %j", (text) => {
    expect(parseVtoolsDateTime(text)).toBeNull();
  });
});
