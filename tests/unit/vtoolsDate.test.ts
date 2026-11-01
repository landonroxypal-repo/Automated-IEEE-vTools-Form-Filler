import { describe, expect, it } from "vitest";
import { InvalidDateTimeError, parseVtoolsDateTime } from "../../src/format/vtoolsDate";

const HOUR = 60 * 60 * 1000;

function expectReason(input: unknown, reason: InvalidDateTimeError["reason"]) {
  try {
    parseVtoolsDateTime(input as string);
  } catch (e) {
    expect(e).toBeInstanceOf(InvalidDateTimeError);
    expect((e as InvalidDateTimeError).reason).toBe(reason);
    return;
  }
  throw new Error(`expected InvalidDateTimeError(${reason}) for ${JSON.stringify(input)} but nothing was thrown`);
}

describe("parseVtoolsDateTime: valid input", () => {
  it("parses the vTools display format", () => {
    expect(parseVtoolsDateTime("10 Nov 2026 06:00 PM")).toBe(Date.UTC(2026, 10, 10, 18, 0));
  });

  it("treats 12:xx AM as midnight and 12:xx PM as noon", () => {
    expect(parseVtoolsDateTime("01 Jan 2027 12:30 AM")).toBe(Date.UTC(2027, 0, 1, 0, 30));
    expect(parseVtoolsDateTime("01 Jan 2027 12:30 PM")).toBe(Date.UTC(2027, 0, 1, 12, 30));
  });

  it("orders times correctly across the AM/PM boundary", () => {
    const am = parseVtoolsDateTime("10 Nov 2026 11:00 AM");
    const pm = parseVtoolsDateTime("10 Nov 2026 01:00 PM");
    expect(pm - am).toBe(2 * HOUR);
  });

  it("accepts 29 Feb in a leap year", () => {
    expect(parseVtoolsDateTime("29 Feb 2028 09:00 AM")).toBe(Date.UTC(2028, 1, 29, 9, 0));
  });

  it("accepts the first and last supported years", () => {
    expect(parseVtoolsDateTime("01 Jan 2000 12:00 AM")).toBe(Date.UTC(2000, 0, 1, 0, 0));
    expect(parseVtoolsDateTime("31 Dec 2099 11:59 PM")).toBe(Date.UTC(2099, 11, 31, 23, 59));
  });
});

describe("parseVtoolsDateTime: invalid input throws", () => {
  it.each([null, undefined, 42, true, {}, [], new Date(2026, 10, 10)])("rejects non-string %j", (input) => {
    expectReason(input, "type");
  });

  it.each([
    "",
    "2026-11-10 18:00",
    "10 Nov 2026 18:00",
    "1 Nov 2026 06:00 PM",
    "10 November 2026 06:00 PM",
    "10 nov 2026 06:00 PM",
    "10 Nov 2026 06:00 pm",
    " 10 Nov 2026 06:00 PM",
    "10 Nov 2026 06:00 PM ",
    "10 Nov 2026 06:00 PM\n",
    "10  Nov 2026 06:00 PM",
  ])("rejects wrong format %j", (text) => {
    expectReason(text, "format");
  });

  it.each([
    "10 Foo 2026 06:00 PM",
    "00 Nov 2026 06:00 PM",
    "31 Feb 2026 10:00 AM",
    "29 Feb 2027 10:00 AM",
    "31 Nov 2026 10:00 AM",
    "10 Nov 2026 13:00 PM",
    "10 Nov 2026 00:00 AM",
    "10 Nov 2026 06:60 PM",
  ])("rejects out-of-range part %j", (text) => {
    expectReason(text, "out-of-range");
  });

  it.each(["10 Nov 0050 06:00 PM", "10 Nov 1999 06:00 PM", "10 Nov 2100 06:00 PM", "10 Nov 9999 06:00 PM"])(
    "rejects unsupported year %j instead of misreading it",
    (text) => {
      expectReason(text, "out-of-range");
    },
  );

  it("includes the bad value and an example in the message", () => {
    expect(() => parseVtoolsDateTime("2026-11-10")).toThrow(/2026-11-10.*10 Nov 2026 06:00 PM/);
  });
});

describe("InvalidDateTimeError: black-box gaps", () => {
  it("carries the original input", () => {
    let error: InvalidDateTimeError | undefined;
    try {
      parseVtoolsDateTime("31 Feb 2026 10:00 AM");
    } catch (e) {
      error = e as InvalidDateTimeError;
    }
    expect(error).toMatchObject({ input: "31 Feb 2026 10:00 AM", reason: "out-of-range" });
  });
});
