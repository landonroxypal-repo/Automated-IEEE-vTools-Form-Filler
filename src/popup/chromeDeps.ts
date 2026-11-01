import type { FillOutcome } from "../page/outcome";
import type { PopupDeps } from "./popupController";

/** The bundled page script (src/page/main.ts) as it is named in the built extension. */
export const PAGE_SCRIPT_FILE = "page.js";

/** The parts of the extension API used by the pop-up. */
export interface ChromeLike {
  tabs: { query(query: { active: boolean; currentWindow: boolean }): Promise<{ id?: unknown; url?: unknown }[]> };
  scripting: {
    executeScript(injection: {
      target: { tabId: number };
      world: "MAIN";
      files?: string[];
      func?: (input: unknown) => unknown;
      args?: unknown[];
    }): Promise<{ result?: unknown }[] | undefined>;
  };
}

/**
 * Runs inside the vTools page. Chrome sends only this function's source text, so it must not use
 * anything from outside its own body (the key below repeats PAGE_API_KEY on purpose).
 */
export async function callPageApi(input: unknown): Promise<unknown> {
  const api = (globalThis as Record<string, unknown>)["__vtoolsEventFiller"] as { fill?: (input: unknown) => unknown } | undefined;
  if (!api || typeof api.fill !== "function") {
    return { status: "error", name: "Error", message: "The filler script is not loaded in this page. Reload the page and try again." };
  }
  return api.fill(input);
}

export function createChromeDeps(chrome: ChromeLike): Pick<PopupDeps, "getActiveTab" | "runInPage"> {
  if (typeof chrome?.tabs?.query !== "function" || typeof chrome?.scripting?.executeScript !== "function") {
    throw new TypeError("chrome must provide tabs.query and scripting.executeScript");
  }

  return {
    async getActiveTab() {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !Number.isSafeInteger(tab.id) || typeof tab.url !== "string") {
        throw new Error("Cannot read the active tab's address. Open the vTools Create Event page and open this pop-up from that tab.");
      }
      return { id: tab.id as number, url: tab.url };
    },

    async runInPage(tabId, input) {
      if (!Number.isSafeInteger(tabId) || tabId <= 0) throw new TypeError(`tabId must be a positive whole number, got ${JSON.stringify(tabId)}`);
      await chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", files: [PAGE_SCRIPT_FILE] });
      const results = await chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", func: callPageApi, args: [input] });
      const result = results?.[0]?.result;
      if (result === undefined) throw new Error("Chrome returned no result from the page; the fill may not have run.");
      return result as FillOutcome;
    },
  };
}
