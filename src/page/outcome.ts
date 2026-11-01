import type { FillStep } from "../plan/buildFillPlan";
import type { ValidationIssue } from "../spec/validateEvent";

/**
 * What a fill run in the page reports back to the pop-up. Chrome can only carry plain data out of
 * the page, not exceptions, so this is the one place errors travel as values. The pop-up turns
 * every non-"filled" outcome straight back into an exception with unwrapOutcome.
 */
export type FillOutcome =
  | { status: "filled"; stepsCompleted: number; totalSteps: number }
  | { status: "invalid"; issues: ValidationIssue[] }
  | { status: "step-failed"; stepIndex: number; totalSteps: number; step: FillStep; message: string }
  | { status: "error"; name: string; message: string }
  | { status: "publish-forbidden" | "wrong-page" | "unsafe-page" | "busy"; message: string };

export class FillFailedError extends Error {
  constructor(readonly outcome: Exclude<FillOutcome, { status: "filled" }>) {
    super(
      outcome.status === "invalid"
        ? `The event JSON has ${outcome.issues.length} problem(s)`
        : `${outcome.status}: ${outcome.message}`,
    );
    this.name = "FillFailedError";
  }
}

const isCount = (n: unknown) => Number.isSafeInteger(n) && (n as number) >= 0;
const isText = (s: unknown) => typeof s === "string";

function isWellFormed(o: Record<string, unknown>): boolean {
  switch (o.status) {
    case "filled":
      return isCount(o.stepsCompleted) && isCount(o.totalSteps);
    case "invalid":
      return Array.isArray(o.issues);
    case "step-failed":
      return isCount(o.stepIndex) && isCount(o.totalSteps) && typeof o.step === "object" && o.step !== null && isText(o.message);
    case "error":
      return isText(o.name) && isText(o.message);
    case "publish-forbidden":
    case "wrong-page":
    case "unsafe-page":
    case "busy":
      return isText(o.message);
    default:
      return false;
  }
}

/** Returns the step counts of a successful run; throws FillFailedError for any other outcome. */
export function unwrapOutcome(outcome: FillOutcome): { stepsCompleted: number; totalSteps: number } {
  if (typeof outcome !== "object" || outcome === null || !isWellFormed(outcome as Record<string, unknown>)) {
    throw new TypeError(`outcome from the page is malformed: ${JSON.stringify(outcome)}`);
  }
  if (outcome.status !== "filled") throw new FillFailedError(outcome);
  return { stepsCompleted: outcome.stepsCompleted, totalSteps: outcome.totalSteps };
}
