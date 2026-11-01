import { describe, expect, it } from "vitest";
import {
  MEETING_FIELDS,
  NotASpeakerKeyError,
  UnknownFieldError,
  isKnownField,
  isSpeakerKey,
  lookupField,
  parentFieldOf,
  parseSpeakerKey,
} from "../../src/spec/fields";

const BUILT_INS = [
  "__proto__",
  "constructor",
  "toString",
  "hasOwnProperty",
  "speakers[speaker1][__proto__]",
  "speakers[speaker1][constructor]",
];
const NOT_SPEAKER_KEYS = [
  "meeting[title]",
  "speakers[speaker0][topic]",
  "speakers[speaker01][topic]",
  "speakers[speaker1][Topic]",
  "speakers[speaker99999999999999999999][topic]",
];
const NON_STRINGS = [null, undefined, 5, {}, ["meeting[title]"]];

describe("lookupField / isKnownField", () => {
  it("finds meeting and speaker fields", () => {
    expect(lookupField("meeting[title]")).toBe(MEETING_FIELDS["meeting[title]"]);
    expect(lookupField("speakers[speaker3][topic]")).toMatchObject({ kind: "text", maxLength: 120 });
    expect(isKnownField("meeting[title]")).toBe(true);
    expect(isKnownField("speakers[speaker3][topic]")).toBe(true);
  });

  it.each([...BUILT_INS, "meeting[titel]", "speakers[speaker1][shoe_size]", ""])(
    "throws UnknownFieldError for %j, and isKnownField says false",
    (name) => {
      expect(() => lookupField(name)).toThrow(UnknownFieldError);
      expect(() => lookupField(name)).toThrow(name === "" ? /""/ : name);
      expect(isKnownField(name)).toBe(false);
    },
  );

  it.each(NON_STRINGS)("throws TypeError for a non-string name %j", (name) => {
    expect(() => lookupField(name as string)).toThrow(/name must be a string/);
    expect(() => isKnownField(name as string)).toThrow(/name must be a string/);
  });
});

describe("parseSpeakerKey / isSpeakerKey", () => {
  it("parses a speaker key", () => {
    expect(parseSpeakerKey("speakers[speaker12][first_name]")).toEqual({ index: 12, prop: "first_name" });
    expect(isSpeakerKey("speakers[speaker12][first_name]")).toBe(true);
  });

  it.each(NOT_SPEAKER_KEYS)("throws NotASpeakerKeyError for %j, and isSpeakerKey says false", (name) => {
    expect(() => parseSpeakerKey(name)).toThrow(NotASpeakerKeyError);
    expect(isSpeakerKey(name)).toBe(false);
  });

  it.each(NON_STRINGS)("throws TypeError for a non-string name %j", (name) => {
    expect(() => parseSpeakerKey(name as string)).toThrow(/name must be a string/);
    expect(() => isSpeakerKey(name as string)).toThrow(/name must be a string/);
  });
});

describe("parentFieldOf", () => {
  it("names the select whose choice loads each dependent select's options", () => {
    expect(parentFieldOf("meeting[subcategory_id]")).toBe("meeting[category_id]");
    expect(parentFieldOf("meeting[state_id]")).toBe("meeting[country_id]");
    expect(parentFieldOf("speakers[speaker3][state_id]")).toBe("speakers[speaker3][country_id]");
  });

  it("throws for a field that is not a dependent select", () => {
    expect(() => parentFieldOf("meeting[title]")).toThrow(/not a dependent select/);
    expect(() => parentFieldOf("meeting[country_id]")).toThrow(/not a dependent select/);
  });

  it("throws UnknownFieldError for an unknown field and TypeError for a non-string", () => {
    expect(() => parentFieldOf("meeting[nope]")).toThrow(UnknownFieldError);
    expect(() => parentFieldOf(null as unknown as string)).toThrow(/name must be a string/);
  });

  it("points every dependent select at a select that exists", () => {
    for (const [name, def] of Object.entries(MEETING_FIELDS)) {
      if (def.kind !== "dependent-select") continue;
      expect(lookupField(parentFieldOf(name)).kind).toBe("select");
    }
  });
});
