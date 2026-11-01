import { describe, expect, it } from "vitest";
import { MEETING_FIELDS, lookupField, parseSpeakerKey } from "../../src/spec/fields";

describe("lookupField", () => {
  it("finds meeting and speaker fields", () => {
    expect(lookupField("meeting[title]")).toBe(MEETING_FIELDS["meeting[title]"]);
    expect(lookupField("speakers[speaker3][topic]")).toMatchObject({ kind: "text", maxLength: 120 });
  });

  it.each(["__proto__", "constructor", "toString", "hasOwnProperty", "speakers[speaker1][__proto__]", "speakers[speaker1][constructor]"])(
    "does not treat the built-in property %j as a field",
    (name) => {
      expect(lookupField(name)).toBeUndefined();
    },
  );

  it.each([null, undefined, 5, {}, ["meeting[title]"]])("throws TypeError for a non-string name %j", (name) => {
    expect(() => lookupField(name as string)).toThrow(TypeError);
    expect(() => lookupField(name as string)).toThrow(/name must be a string/);
  });
});

describe("parseSpeakerKey", () => {
  it("parses a speaker key", () => {
    expect(parseSpeakerKey("speakers[speaker12][first_name]")).toEqual({ index: 12, prop: "first_name" });
  });

  it.each(["meeting[title]", "speakers[speaker0][topic]", "speakers[speaker01][topic]", "speakers[speaker1][Topic]", "speakers[speaker99999999999999999999][topic]"])(
    "returns null for %j, which is not a usable speaker key",
    (name) => {
      expect(parseSpeakerKey(name)).toBeNull();
    },
  );

  it.each([null, undefined, 5, {}])("throws TypeError for a non-string name %j", (name) => {
    expect(() => parseSpeakerKey(name as string)).toThrow(TypeError);
    expect(() => parseSpeakerKey(name as string)).toThrow(/name must be a string/);
  });
});
