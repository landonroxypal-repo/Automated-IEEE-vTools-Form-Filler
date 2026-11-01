import { describe, expect, it } from "vitest";
import {
  EventValidationError,
  PublishForbiddenError,
  assertNoPublishKeys,
  validateEvent,
} from "../../src/spec/validateEvent";
import { catalog, validEvent } from "./testData";

// The tool must never be able to publish. Any JSON that so much as mentions publishing is
// rejected before anything else is looked at, whatever value it carries.

function expectPublishForbidden(input: unknown) {
  expect(() => validateEvent(input, catalog)).toThrow(PublishForbiddenError);
}

describe("publish guard", () => {
  it.each([true, false, 1, 0, "1", "0", "", null])("rejects meeting[publish] with value %j", (value) => {
    expectPublishForbidden({ ...validEvent, "meeting[publish]": value });
  });

  it.each(["MEETING[PUBLISH]", " meeting[publish] ", "meeting[ publish ]", "meeting[Publish]", "publish"])(
    "rejects the spelling variant %j",
    (key) => {
      expectPublishForbidden({ ...validEvent, [key]: true });
    },
  );

  it("rejects publish nested inside an object", () => {
    expectPublishForbidden({ ...validEvent, meeting: { publish: true } });
  });

  it("rejects publish inside an array", () => {
    expectPublishForbidden([{ ...validEvent, "meeting[publish]": true }]);
  });

  it("takes priority over every other validation error", () => {
    expectPublishForbidden({ "meeting[publish]": true, "not a real field": 1 });
  });

  it("is a distinct error type, not a field validation issue", () => {
    let caught: unknown;
    try {
      validateEvent({ ...validEvent, "meeting[publish]": true }, catalog);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(PublishForbiddenError);
    expect(caught).not.toBeInstanceOf(EventValidationError);
    expect((caught as PublishForbiddenError).key).toBe("meeting[publish]");
  });

  it("explains that events are only ever saved as drafts for review", () => {
    expect(() => validateEvent({ ...validEvent, "meeting[publish]": true }, catalog)).toThrow(/draft/i);
  });

  it("allows a valid event without any publish key", () => {
    expect(() => validateEvent(validEvent, catalog)).not.toThrow();
  });
});

describe("assertNoPublishKeys (used by the pop-up before anything reaches the page)", () => {
  it.each([
    { "meeting[publish]": false },
    { " Meeting[ PUBLISH ] ": 1 },
    { meeting: { publish: true } },
    [{ ok: 1 }, { publish: 0 }],
  ])("throws PublishForbiddenError for %j", (input) => {
    expect(() => assertNoPublishKeys(input)).toThrow(PublishForbiddenError);
  });

  it("names the offending key", () => {
    expect(() => assertNoPublishKeys({ a: { "meeting[publish]": 1 } })).toThrow(/"meeting\[publish\]"/);
  });

  it.each([validEvent, {}, [], "text", 5, null, true])("accepts input without publish keys: %j", (input) => {
    expect(() => assertNoPublishKeys(input)).not.toThrow();
  });

  it("does not loop forever on a self-referencing object", () => {
    const cyclic: Record<string, unknown> = { ok: 1 };
    cyclic.self = cyclic;
    expect(() => assertNoPublishKeys(cyclic)).not.toThrow();
  });
});
