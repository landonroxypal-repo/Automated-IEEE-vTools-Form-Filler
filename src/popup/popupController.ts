import { unwrapOutcome, type FillOutcome } from "../page/outcome";
import { assertNoPublishKeys } from "../spec/validateEvent";
import { describeError, type PopupMessage } from "./describeError";
import { assertCreateEventPage } from "./pageTarget";
import { readEventFile } from "./parseEventFile";
import { renderMessages } from "./renderMessages";

export interface PopupDeps {
  document: Document;
  getActiveTab(): Promise<{ id: number; url: string }>;
  runInPage(tabId: number, input: unknown): Promise<FillOutcome>;
}

export interface PopupController {
  /** Reads, parses, and checks a file. Problems with its content are shown, not thrown. */
  loadFile(file: File): Promise<void>;
  /** Fills the active tab. Throws only when no file is loaded; every other problem is shown. */
  fill(): Promise<void>;
}

const NO_FILE = "Choose an event JSON file first";

function checkDeps(deps: PopupDeps) {
  if (typeof deps !== "object" || deps === null) throw new TypeError("deps must be an object");
  if (typeof deps.document?.getElementById !== "function") throw new TypeError("deps.document must be a Document");
  for (const key of ["getActiveTab", "runInPage"] as const) {
    if (typeof deps[key] !== "function") throw new TypeError(`deps.${key} must be a function`);
  }
}

export function createPopupController(deps: PopupDeps): PopupController {
  checkDeps(deps);
  const element = <T extends HTMLElement>(id: string): T => {
    const el = deps.document.getElementById(id);
    if (!el) throw new Error(`the pop-up page is missing #${id}`);
    return el as T;
  };
  const fileInput = element<HTMLInputElement>("event-file");
  const button = element<HTMLButtonElement>("fill");
  const result = element<HTMLElement>("result");
  const show = (message: PopupMessage) => renderMessages(result, message);

  let loaded: { input: unknown } | undefined;

  async function loadFile(file: File): Promise<void> {
    loaded = undefined;
    button.disabled = true;
    try {
      const input = await readEventFile(file);
      assertNoPublishKeys(input);
      loaded = { input };
      const count = typeof input === "object" && input !== null && !Array.isArray(input) ? Object.keys(input).length : 0;
      show({
        tone: "info",
        title: `Loaded ${file.name}`,
        lines: [`${count} field${count === 1 ? "" : "s"}.`, "Open the vTools Create Event page in this tab, then click Fill form."],
      });
      button.disabled = false;
    } catch (e) {
      show(describeError(e));
      if (e instanceof TypeError) throw e;
    }
  }

  async function fill(): Promise<void> {
    if (!loaded) {
      show({ tone: "error", title: NO_FILE, lines: [] });
      throw new Error(NO_FILE);
    }
    button.disabled = true;
    show({ tone: "info", title: "Filling the form…", lines: ["Keep this tab open until it finishes."] });
    try {
      const tab = await deps.getActiveTab();
      assertCreateEventPage(tab.url);
      const { stepsCompleted, totalSteps } = unwrapOutcome(await deps.runInPage(tab.id, loaded.input));
      show({
        tone: "success",
        title: `Filled the form (${stepsCompleted} of ${totalSteps} steps)`,
        lines: [
          "Review every section, then click Save as Draft yourself.",
          "Nothing has been saved by this tool. Note that vTools may autosave a draft as the form changes.",
        ],
      });
    } catch (e) {
      show(describeError(e));
    } finally {
      button.disabled = loaded === undefined;
    }
  }

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) loadFile(file).catch(() => {}); // already shown in the pop-up
  });
  button.addEventListener("click", () => {
    fill().catch(() => {}); // already shown in the pop-up
  });

  return { loadFile, fill };
}
