import { describe, expect, it } from "vitest";
import { FillFailedError, unwrapOutcome, type FillOutcome } from "../../src/page/outcome";

const failures: FillOutcome[] = [
  { status: "invalid", issues: [{ field: "meeting[title]", rule: "required", message: "is required" }] },
  { status: "publish-forbidden", message: "no publishing" },
  { status: "wrong-page", message: "not the Create Event form" },
  { status: "unsafe-page", message: "publish checkbox checked" },
  { status: "busy", message: "already filling" },
  {
    status: "step-failed",
    stepIndex: 2,
    totalSteps: 9,
    step: { kind: "set-text", name: "meeting[title]", value: "x" },
    message: "Step 3 of 9 failed",
  },
  { status: "error", name: "TypeError", message: "boom" },
];

describe("unwrapOutcome", () => {
  it("returns the step counts for a filled outcome", () => {
    expect(unwrapOutcome({ status: "filled", stepsCompleted: 17, totalSteps: 17 })).toEqual({
      stepsCompleted: 17,
      totalSteps: 17,
    });
  });

  it.each(failures)("throws FillFailedError carrying the outcome for $status", (outcome) => {
    let error: unknown;
    try {
      unwrapOutcome(outcome);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(FillFailedError);
    expect((error as FillFailedError).outcome).toEqual(outcome);
  });

  it.each([
    null,
    undefined,
    "filled",
    {},
    { status: "weird" },
    { status: "filled" },
    { status: "filled", stepsCompleted: "17", totalSteps: 17 },
    { status: "invalid" },
    { status: "invalid", issues: "lots" },
    { status: "step-failed", message: "x" },
    { status: "busy" },
  ])("throws TypeError for the malformed outcome %j", (outcome) => {
    expect(() => unwrapOutcome(outcome as never)).toThrow(TypeError);
    expect(() => unwrapOutcome(outcome as never)).toThrow(/outcome/);
  });
});
