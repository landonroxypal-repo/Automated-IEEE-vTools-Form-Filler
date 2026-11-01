import { describe, expect, it } from "vitest";
import { EventValidationError, validateEvent, type ValidationIssue } from "../../src/spec/validateEvent";
import { catalog, validEvent } from "./testData";

function issuesFor(input: unknown): ValidationIssue[] {
  try {
    validateEvent(input, catalog);
  } catch (e) {
    if (e instanceof EventValidationError) return e.issues;
    throw e;
  }
  return [];
}

function expectIssue(input: unknown, field: string, rule: ValidationIssue["rule"]) {
  expect(issuesFor(input)).toContainEqual(expect.objectContaining({ field, rule }));
}

const without = (...keys: string[]) =>
  Object.fromEntries(Object.entries(validEvent).filter(([k]) => !keys.includes(k)));

describe("validateEvent: shape", () => {
  it("accepts the minimal valid event and resolves labels to IDs", () => {
    const result = validateEvent(validEvent, catalog);
    expect(result.values["meeting[category_id]"]).toBe("2");
    expect(result.values["meeting[country_id]"]).toBe("221");
    expect(result.values["meeting[tm_zone_info]"]).toBe("America/Denver");
  });

  it.each([null, "event", 42, [validEvent]])("rejects a non-object top level: %j", (input) => {
    expectIssue(input, "(root)", "type");
  });

  it("rejects field names that are not on the form", () => {
    expectIssue({ ...validEvent, "meeting[titel]": "x" }, "meeting[titel]", "unknown-field");
  });

  it("rejects page fields that the tool deliberately does not fill", () => {
    for (const key of ["meeting[cancelled]", "meeting[registration_fee][level1][amount]", "authenticity_token"]) {
      expectIssue({ ...validEvent, [key]: "1" }, key, "unknown-field");
    }
  });

  it("reports every issue at once rather than stopping at the first", () => {
    const issues = issuesFor({ ...without("meeting[title]"), "meeting[city]": 5, bogus: 1 });
    expect(issues.map((i) => i.field).sort()).toEqual(["bogus", "meeting[city]", "meeting[title]"]);
  });
});

describe("validateEvent: required fields", () => {
  it.each([
    "meeting[meeting_host][0][spoid]",
    "meeting[meeting_host][0][contact_email]",
    "meeting[title]",
    "meeting[category_id]",
    "meeting[start_time]",
    "meeting[end_time]",
    "meeting[tm_zone_info]",
    "meeting[description]",
    "meeting[keywords]",
  ])("requires %s", (field) => {
    expectIssue(without(field), field, "required");
  });

  it("treats a whitespace-only text value as missing", () => {
    expectIssue({ ...validEvent, "meeting[title]": "   " }, "meeting[title]", "required");
  });

  it("requires city and country for in-person and hybrid events", () => {
    expectIssue(without("meeting[city]"), "meeting[city]", "required");
    expectIssue(
      { ...without("meeting[country_id]"), "meeting[location_type]": "hybrid", "meeting[virtual_info]": "<p>link</p>" },
      "meeting[country_id]",
      "required",
    );
  });

  it("requires virtual info for virtual and hybrid events", () => {
    expectIssue({ ...validEvent, "meeting[location_type]": "hybrid" }, "meeting[virtual_info]", "required");
  });

  it("requires a registration URL for external registration", () => {
    expectIssue({ ...validEvent, _registration_type: "External" }, "meeting[registration_url]", "required");
  });

  it("requires a speaker's preferred name when a first or last name is given", () => {
    expectIssue(
      { ...validEvent, "speakers[speaker1][first_name]": "Jane" },
      "speakers[speaker1][display_name]",
      "required",
    );
  });
});

describe("validateEvent: fields that do not apply", () => {
  it("rejects in-person fields on a virtual event", () => {
    expectIssue(
      { ...validEvent, "meeting[location_type]": "virtual", "meeting[virtual_info]": "<p>link</p>" },
      "meeting[city]",
      "not-applicable",
    );
  });

  it("rejects virtual info on an in-person event", () => {
    expectIssue({ ...validEvent, "meeting[virtual_info]": "<p>link</p>" }, "meeting[virtual_info]", "not-applicable");
  });

  it("rejects standard-registration fields when registration is external or none", () => {
    expectIssue(
      { ...validEvent, _registration_type: "None", "meeting[max_registrations]": "10" },
      "meeting[max_registrations]",
      "not-applicable",
    );
  });
});

describe("validateEvent: radios accept the value or the visible label", () => {
  it("maps 'In-Person' to physical and 'External' to Custom", () => {
    const result = validateEvent(
      { ...validEvent, "meeting[location_type]": "In-Person", _registration_type: "External", "meeting[registration_url]": "https://example.org/r" },
      catalog,
    );
    expect(result.values["meeting[location_type]"]).toBe("physical");
    expect(result.values["_registration_type"]).toBe("Custom");
  });

  it("rejects an unknown radio choice", () => {
    expectIssue({ ...validEvent, "meeting[location_type]": "online" }, "meeting[location_type]", "option");
  });

  it("defaults to in-person with standard registration when not given", () => {
    const result = validateEvent(validEvent, catalog);
    expect(result.locationType).toBe("physical");
    expect(result.registrationType).toBe("Standard");
  });
});

describe("validateEvent: selects", () => {
  it("passes the option resolver's reason through", () => {
    const issues = issuesFor({ ...validEvent, "meeting[country_id]": "-221" });
    expect(issues).toContainEqual(
      expect.objectContaining({ field: "meeting[country_id]", rule: "option", reason: "negative-id" }),
    );
  });

  it("uses the country list for speaker countries too", () => {
    const result = validateEvent({ ...validEvent, "speakers[speaker1][country_id]": "Canada" }, catalog);
    expect(result.values["speakers[speaker1][country_id]"]).toBe("36");
  });

  it("checks state/sub-category IDs now and leaves labels to be resolved once the page loads them", () => {
    expectIssue({ ...validEvent, "meeting[state_id]": -3 }, "meeting[state_id]", "option");
    expectIssue({ ...validEvent, "meeting[subcategory_id]": "" }, "meeting[subcategory_id]", "option");
    const result = validateEvent({ ...validEvent, "meeting[state_id]": "Colorado" }, catalog);
    expect(result.values["meeting[state_id]"]).toBe("Colorado");
  });
});

describe("validateEvent: value types and formats", () => {
  it("enforces maximum lengths from the page", () => {
    expectIssue({ ...validEvent, "meeting[title]": "x".repeat(257) }, "meeting[title]", "max-length");
    expect(issuesFor({ ...validEvent, "meeting[title]": "x".repeat(256) })).toEqual([]);
    expectIssue({ ...validEvent, "meeting[room_number]": "x".repeat(49) }, "meeting[room_number]", "max-length");
    expectIssue({ ...validEvent, "speakers[speaker2][topic]": "x".repeat(121) }, "speakers[speaker2][topic]", "max-length");
  });

  it("requires strings for text fields and booleans for checkboxes", () => {
    expectIssue({ ...validEvent, "meeting[title]": 123 }, "meeting[title]", "type");
    expectIssue({ ...validEvent, "meeting[require_terms]": "yes" }, "meeting[require_terms]", "type");
  });

  it("validates email addresses", () => {
    expectIssue(
      { ...validEvent, "meeting[meeting_host][0][contact_email]": "not-an-email" },
      "meeting[meeting_host][0][contact_email]",
      "format",
    );
  });

  it("validates URLs as http(s)", () => {
    expectIssue({ ...validEvent, "meeting[survey_url]": "javascript:alert(1)" }, "meeting[survey_url]", "format");
    expect(issuesFor({ ...validEvent, "meeting[survey_url]": "https://example.org/s" })).toEqual([]);
  });

  it("validates registration limits as whole numbers from 0 to 999", () => {
    expectIssue({ ...validEvent, "meeting[max_registrations]": "-1" }, "meeting[max_registrations]", "range");
    expectIssue({ ...validEvent, "meeting[max_registrations]": 1000 }, "meeting[max_registrations]", "range");
    expectIssue({ ...validEvent, "meeting[max_registrations]": "ten" }, "meeting[max_registrations]", "format");
    expect(validateEvent({ ...validEvent, "meeting[max_registrations]": 40 }, catalog).values["meeting[max_registrations]"]).toBe("40");
  });

  it("rejects negative attendance numbers", () => {
    expectIssue({ ...validEvent, "meeting[ieee_attending]": -2 }, "meeting[ieee_attending]", "range");
  });

  it("validates latitude and longitude ranges", () => {
    expectIssue({ ...validEvent, "meeting[user_override_latitude]": "91" }, "meeting[user_override_latitude]", "range");
    expectIssue({ ...validEvent, "meeting[user_override_longitude]": -181 }, "meeting[user_override_longitude]", "range");
  });

  it("validates the date/time format", () => {
    expectIssue({ ...validEvent, "meeting[start_time]": "2026-11-10 18:00" }, "meeting[start_time]", "format");
  });
});

describe("validateEvent: speakers", () => {
  it("accepts speakers beyond the two shown on the page", () => {
    expect(issuesFor({ ...validEvent, "speakers[speaker5][topic]": "Lightning talk" })).toEqual([]);
  });

  it.each(["speakers[speaker0][topic]", "speakers[speaker-1][topic]", "speakers[speaker01][topic]", "speakers[speaker1][shoe_size]"])(
    "rejects %s",
    (key) => {
      expectIssue({ ...validEvent, [key]: "x" }, key, "unknown-field");
    },
  );
});

describe("validateEvent: dates", () => {
  it("requires the end time after the start time", () => {
    expectIssue({ ...validEvent, "meeting[end_time]": "10 Nov 2026 06:00 PM" }, "meeting[end_time]", "date-order");
  });

  it("allows exactly 5 days but not more", () => {
    expect(issuesFor({ ...validEvent, "meeting[end_time]": "15 Nov 2026 06:00 PM" })).toEqual([]);
    expectIssue({ ...validEvent, "meeting[end_time]": "15 Nov 2026 06:01 PM" }, "meeting[end_time]", "max-duration");
  });

  it("requires registration to open before it closes", () => {
    expectIssue(
      { ...validEvent, "meeting[reg_start_time]": "05 Nov 2026 12:00 AM", "meeting[reg_end_time]": "01 Nov 2026 12:00 AM" },
      "meeting[reg_end_time]",
      "date-order",
    );
  });
});
