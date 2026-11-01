import { describe, expect, it } from "vitest";
import { FillFailedError } from "../../src/page/outcome";
import { describeError } from "../../src/popup/describeError";
import { NotCreateEventPageError } from "../../src/popup/pageTarget";
import { EventFileError, parseEventFile } from "../../src/popup/parseEventFile";
import { PublishForbiddenError } from "../../src/spec/validateEvent";

const thrownBy = (fn: () => unknown): unknown => {
  try {
    fn();
  } catch (e) {
    return e;
  }
  throw new Error("expected a throw");
};

const AUTOSAVE = /autosave/i;

describe("describeError", () => {
  it("explains a duplicate key with its name and line", () => {
    const message = describeError(thrownBy(() => parseEventFile('{"a": 1,\n"a": 2}')));
    expect(message).toMatchObject({ tone: "error", title: "The JSON file has a duplicate key" });
    expect(message.lines.join(" ")).toMatch(/"a".*line 2/);
  });

  it.each([
    ["syntax", "{oops}", "The file is not valid JSON"],
    ["empty", "  ", "The file is empty"],
  ])("explains a %s file error", (_reason, text, title) => {
    expect(describeError(thrownBy(() => parseEventFile(text)))).toMatchObject({ tone: "error", title });
  });

  it("explains an oversized file", () => {
    expect(describeError(new EventFileError("too-large", "is too big"))).toMatchObject({ title: "The file is too large" });
  });

  it("explains a publish key, from the pop-up or from the page", () => {
    for (const error of [
      new PublishForbiddenError("meeting[publish]"),
      new FillFailedError({ status: "publish-forbidden", message: "nope" }),
    ]) {
      expect(describeError(error)).toMatchObject({ tone: "error", title: "This tool never publishes" });
    }
  });

  it("asks for the Create Event page, showing the current address", () => {
    const message = describeError(new NotCreateEventPageError("https://example.org/"));
    expect(message).toMatchObject({ tone: "error", title: "Open the vTools Create Event page first" });
    expect(message.lines.join(" ")).toContain("https://example.org/");
  });

  it("lists every validation problem as field: message", () => {
    const message = describeError(
      new FillFailedError({
        status: "invalid",
        issues: [
          { field: "meeting[title]", rule: "required", message: "is required" },
          { field: "meeting[city]", rule: "max-length", message: "is too long" },
        ],
      }),
    );
    expect(message).toEqual({
      tone: "error",
      title: "The event JSON has 2 problems",
      lines: ["meeting[title]: is required", "meeting[city]: is too long", "Nothing was filled in."],
    });
  });

  it("says which step failed and warns that vTools may have autosaved a draft", () => {
    const message = describeError(
      new FillFailedError({
        status: "step-failed",
        stepIndex: 4,
        totalSteps: 20,
        step: { kind: "set-dependent-select", name: "meeting[state_id]", input: "Atlantis", parent: "meeting[country_id]" },
        message: "Step 5 of 20 failed: no such state",
      }),
    );
    expect(message.title).toBe("Stopped at step 5 of 20");
    expect(message.lines[0]).toBe("Step 5 of 20 failed: no such state");
    expect(message.lines.join(" ")).toMatch(AUTOSAVE);
  });

  it.each([
    [{ status: "unsafe-page", message: "checked" }, "Stopped: the publish checkbox looked unsafe"],
    [{ status: "wrong-page", message: "no form" }, "Open the vTools Create Event page first"],
    [{ status: "busy", message: "running" }, "Already filling this page"],
    [{ status: "error", name: "TypeError", message: "boom" }, "Something went wrong"],
  ] as const)("explains a %j outcome", (outcome, title) => {
    const message = describeError(new FillFailedError(outcome));
    expect(message).toMatchObject({ tone: "error", title });
    expect(message.lines[0]).toBe(outcome.message);
  });

  it("falls back to the message of any other error", () => {
    expect(describeError(new RangeError("odd"))).toEqual({ tone: "error", title: "Something went wrong", lines: ["RangeError: odd"] });
  });

  it.each([["a string", "a string"], [42, "42"], [null, "null"], [undefined, "undefined"]])(
    "describes the thrown non-error %j",
    (thrown, text) => {
      expect(describeError(thrown)).toEqual({ tone: "error", title: "Something went wrong", lines: [text] });
    },
  );
});
