import { FillFailedError } from "../page/outcome";
import { PublishForbiddenError } from "../spec/validateEvent";
import { NotCreateEventPageError } from "./pageTarget";
import { EventFileError } from "./parseEventFile";

export interface PopupMessage {
  tone: "info" | "success" | "error";
  title: string;
  lines: string[];
}

export const AUTOSAVE_WARNING =
  "Fields filled before this point stay on the page, and vTools may already have autosaved a draft. " +
  "Check My Events and delete it if you don't want it.";

const FILE_TITLES: Record<EventFileError["reason"], string> = {
  "duplicate-key": "The JSON file has a duplicate key",
  syntax: "The file is not valid JSON",
  empty: "The file is empty",
  "too-large": "The file is too large",
};

const error = (title: string, lines: string[]): PopupMessage => ({ tone: "error", title, lines });

/** Turns anything thrown during a pop-up action into a message for the person using it. */
export function describeError(thrown: unknown): PopupMessage {
  if (thrown instanceof EventFileError) return error(FILE_TITLES[thrown.reason], [thrown.message]);
  if (thrown instanceof PublishForbiddenError) return error("This tool never publishes", [thrown.message]);
  if (thrown instanceof NotCreateEventPageError) return error("Open the vTools Create Event page first", [thrown.message]);

  if (thrown instanceof FillFailedError) {
    const outcome = thrown.outcome;
    switch (outcome.status) {
      case "invalid": {
        const n = outcome.issues.length;
        return error(`The event JSON has ${n} problem${n === 1 ? "" : "s"}`, [
          ...outcome.issues.map((i) => `${i.field}: ${i.message}`),
          "Nothing was filled in.",
        ]);
      }
      case "step-failed":
        return error(`Stopped at step ${outcome.stepIndex + 1} of ${outcome.totalSteps}`, [outcome.message, AUTOSAVE_WARNING]);
      case "publish-forbidden":
        return error("This tool never publishes", [outcome.message]);
      case "unsafe-page":
        return error("Stopped: the publish checkbox looked unsafe", [outcome.message]);
      case "wrong-page":
        return error("Open the vTools Create Event page first", [outcome.message]);
      case "busy":
        return error("Already filling this page", [outcome.message]);
      case "error":
        return error("Something went wrong", [outcome.message]);
    }
  }

  if (thrown instanceof Error) return error("Something went wrong", [`${thrown.name}: ${thrown.message}`]);
  return error("Something went wrong", [String(thrown)]);
}
