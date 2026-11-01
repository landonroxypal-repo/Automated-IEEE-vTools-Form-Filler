import { describe, expect, it } from "vitest";
import {
  OptionResolutionError,
  checkOptionInput,
  resolveOption,
  type SelectOption,
} from "../../src/spec/resolveOption";

// Option lists copied from fixtures/pages/event-create.html
const countries: SelectOption[] = [
  { value: "", label: "" },
  { value: "36", label: "Canada" },
  { value: "220", label: "United Kingdom" },
  { value: "221", label: "United States" },
];

const categories: SelectOption[] = [
  { value: "", label: "Select one ..." },
  { value: "1", label: "Professional" },
  { value: "2", label: "Technical" },
  { value: "6", label: "Pre-U STEM Program" },
];

const timeZones: SelectOption[] = [
  { value: "", label: " " },
  { value: "America/Denver", label: "(UTC-06:00) Mountain Time (US & Canada)" },
  { value: "America/Mexico_City", label: "(UTC-06:00) Guadalajara" },
  { value: "America/Mexico_City", label: "(UTC-06:00) Mexico City" },
];

function expectReason(fn: () => unknown, reason: OptionResolutionError["reason"]) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(OptionResolutionError);
    expect((e as OptionResolutionError).reason).toBe(reason);
    return;
  }
  throw new Error(`expected OptionResolutionError(${reason}) but nothing was thrown`);
}

describe("resolveOption: valid input", () => {
  it("accepts an existing ID given as a string", () => {
    expect(resolveOption("meeting[country_id]", "221", countries)).toBe("221");
  });

  it("accepts an existing ID given as a number", () => {
    expect(resolveOption("meeting[country_id]", 221, countries)).toBe("221");
  });

  it("accepts a non-numeric option value", () => {
    expect(resolveOption("meeting[tm_zone_info]", "America/Denver", timeZones)).toBe("America/Denver");
  });

  it("converts a visible label to its ID", () => {
    expect(resolveOption("meeting[country_id]", "United States", countries)).toBe("221");
    expect(resolveOption("meeting[category_id]", "Pre-U STEM Program", categories)).toBe("6");
  });

  it("matches labels case-insensitively and ignores surrounding whitespace", () => {
    expect(resolveOption("meeting[category_id]", "  technical ", categories)).toBe("2");
  });

  it("accepts a time zone label with or without its (UTC±hh:mm) prefix", () => {
    expect(resolveOption("meeting[tm_zone_info]", "(UTC-06:00) Mountain Time (US & Canada)", timeZones)).toBe("America/Denver");
    expect(resolveOption("meeting[tm_zone_info]", "Mountain Time (US & Canada)", timeZones)).toBe("America/Denver");
  });

  it("allows different labels that share one value", () => {
    expect(resolveOption("meeting[tm_zone_info]", "Guadalajara", timeZones)).toBe("America/Mexico_City");
    expect(resolveOption("meeting[tm_zone_info]", "Mexico City", timeZones)).toBe("America/Mexico_City");
  });
});

describe("resolveOption: invalid input is rejected", () => {
  it("rejects a negative ID (string or number)", () => {
    expectReason(() => resolveOption("meeting[country_id]", "-5", countries), "negative-id");
    expectReason(() => resolveOption("meeting[country_id]", -221, countries), "negative-id");
  });

  it("rejects an ID that is not in the option list", () => {
    expectReason(() => resolveOption("meeting[country_id]", "9999", countries), "unknown-id");
    expectReason(() => resolveOption("meeting[country_id]", 9999, countries), "unknown-id");
  });

  it("rejects a label that is not in the option list", () => {
    expectReason(() => resolveOption("meeting[country_id]", "Untied States", countries), "unknown-label");
  });

  it("does not let placeholder options be chosen by label", () => {
    expectReason(() => resolveOption("meeting[category_id]", "Select one ...", categories), "unknown-label");
  });

  it("rejects an empty value", () => {
    expectReason(() => resolveOption("meeting[country_id]", "", countries), "empty");
    expectReason(() => resolveOption("meeting[country_id]", "   ", countries), "empty");
  });

  it("rejects non-integer numbers and non-string/number types", () => {
    expectReason(() => resolveOption("meeting[country_id]", 2.5, countries), "invalid-type");
    expectReason(() => resolveOption("meeting[country_id]", true, countries), "invalid-type");
    expectReason(() => resolveOption("meeting[country_id]", null, countries), "invalid-type");
    expectReason(() => resolveOption("meeting[country_id]", { id: 221 }, countries), "invalid-type");
  });

  it("rejects a label that matches options with different values", () => {
    const dupes: SelectOption[] = [
      { value: "10", label: "Georgia" },
      { value: "78", label: "Georgia" },
    ];
    expectReason(() => resolveOption("meeting[state_id]", "Georgia", dupes), "ambiguous-label");
  });

  it("names the field and the bad value in the error message", () => {
    expect(() => resolveOption("meeting[country_id]", "Atlantis", countries)).toThrow(
      /meeting\[country_id\].*Atlantis/,
    );
  });
});

describe("resolveOption: input scrubbing", () => {
  it.each([NaN, Infinity, -Infinity, 1e21, 2 ** 53])("rejects the unusable number %j", (n) => {
    expectReason(() => resolveOption("meeting[country_id]", n, countries), "invalid-type");
  });

  it("trims whitespace around an ID", () => {
    expect(resolveOption("meeting[country_id]", " 221 ", countries)).toBe("221");
  });

  it.each(["+221", "221.0", "0x DD", "2 21"])("does not treat %j as an ID", (text) => {
    expectReason(() => resolveOption("meeting[country_id]", text, countries), "unknown-label");
  });

  it.each([null, undefined, "", "   ", 5])("throws TypeError for an invalid field name %j", (field) => {
    expect(() => resolveOption(field as string, "221", countries)).toThrow(TypeError);
    expect(() => resolveOption(field as string, "221", countries)).toThrow(/field must be a non-empty string/);
  });

  it.each([null, undefined, "options", {}, 5])("throws TypeError when options is %j", (options) => {
    expect(() => resolveOption("meeting[country_id]", "221", options as unknown as SelectOption[])).toThrow(TypeError);
    expect(() => resolveOption("meeting[country_id]", "221", options as unknown as SelectOption[])).toThrow(/options must be an array/);
  });

  it.each([[[null]], [[{ value: 221, label: "United States" }]], [[{ value: "221" }]], [["221"]]])(
    "throws TypeError for a malformed option entry %j",
    (options) => {
      expect(() => resolveOption("meeting[country_id]", "221", options as unknown as SelectOption[])).toThrow(TypeError);
      expect(() => resolveOption("meeting[country_id]", "221", options as unknown as SelectOption[])).toThrow(/options must be an array/);
    },
  );
});

describe("checkOptionInput", () => {
  it("returns the trimmed text of a string or whole number", () => {
    expect(checkOptionInput("meeting[state_id]", "  Colorado ")).toBe("Colorado");
    expect(checkOptionInput("meeting[state_id]", 12)).toBe("12");
  });

  it("rejects empty, negative, and wrongly-typed input", () => {
    expectReason(() => checkOptionInput("meeting[state_id]", " "), "empty");
    expectReason(() => checkOptionInput("meeting[state_id]", "-4"), "negative-id");
    expectReason(() => checkOptionInput("meeting[state_id]", -4), "negative-id");
    expectReason(() => checkOptionInput("meeting[state_id]", NaN), "invalid-type");
    expectReason(() => checkOptionInput("meeting[state_id]", ["CO"]), "invalid-type");
  });

  it.each([null, "", 5])("throws TypeError for an invalid field name %j", (field) => {
    expect(() => checkOptionInput(field as string, "x")).toThrow(TypeError);
    expect(() => checkOptionInput(field as string, "x")).toThrow(/field must be a non-empty string/);
  });
});

describe("OptionResolutionError: black-box gaps", () => {
  it("carries the field and the original input", () => {
    let error: OptionResolutionError | undefined;
    try {
      resolveOption("meeting[country_id]", " Atlantis ", countries);
    } catch (e) {
      error = e as OptionResolutionError;
    }
    expect(error).toMatchObject({ field: "meeting[country_id]", input: " Atlantis ", reason: "unknown-label" });
  });
});
