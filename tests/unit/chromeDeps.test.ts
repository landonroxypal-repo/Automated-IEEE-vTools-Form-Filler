import { afterEach, describe, expect, it, vi } from "vitest";
import { PAGE_API_KEY } from "../../src/page/fillEventInPage";
import { PAGE_SCRIPT_FILE, callPageApi, createChromeDeps } from "../../src/popup/chromeDeps";

function fakeChrome(tabs: unknown[] = [{ id: 7, url: "https://events.vtools.ieee.org/tego_/event/create" }]) {
  const executeScript = vi.fn(async (injection: { files?: string[] }) =>
    injection.files ? [{ result: undefined }] : [{ result: { status: "filled", stepsCompleted: 3, totalSteps: 3 } }],
  );
  return {
    tabs: { query: vi.fn(async () => tabs) },
    scripting: { executeScript },
  };
}

describe("createChromeDeps", () => {
  it.each([null, undefined, {}, { tabs: {} }, { tabs: { query: () => [] }, scripting: {} }])("throws TypeError for %j", (chrome) => {
    expect(() => createChromeDeps(chrome as never)).toThrow(/chrome must provide/);
  });
});

describe("getActiveTab", () => {
  it("returns the id and URL of the active tab in the current window", async () => {
    const chrome = fakeChrome();
    await expect(createChromeDeps(chrome as never).getActiveTab()).resolves.toEqual({
      id: 7,
      url: "https://events.vtools.ieee.org/tego_/event/create",
    });
    expect(chrome.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
  });

  it.each([[[]], [[{ url: "https://x" }]], [[{ id: 7 }]], [[{ id: "7", url: "https://x" }]]])(
    "throws when the active tab is unusable: %j",
    async (tabs) => {
      await expect(createChromeDeps(fakeChrome(tabs) as never).getActiveTab()).rejects.toThrow(/active tab/);
    },
  );
});

describe("runInPage", () => {
  it("injects the page script, then calls it with the event, both in the page's own JavaScript world", async () => {
    const chrome = fakeChrome();
    const input = { "meeting[title]": "Workshop" };
    const outcome = await createChromeDeps(chrome as never).runInPage(7, input);
    expect(outcome).toEqual({ status: "filled", stepsCompleted: 3, totalSteps: 3 });
    expect(chrome.scripting.executeScript.mock.calls).toEqual([
      [{ target: { tabId: 7 }, world: "MAIN", files: [PAGE_SCRIPT_FILE] }],
      [{ target: { tabId: 7 }, world: "MAIN", func: callPageApi, args: [input] }],
    ]);
  });

  it.each([[[]], [undefined], [[{}]], [[{ result: undefined }]]])("throws when Chrome returns no result: %j", async (results) => {
    const chrome = fakeChrome();
    chrome.scripting.executeScript.mockImplementation(async (injection: { files?: string[] }) =>
      injection.files ? [{ result: undefined }] : (results as never),
    );
    await expect(createChromeDeps(chrome as never).runInPage(7, {})).rejects.toThrow(/no result/);
  });

  it.each([0, -1, 1.5, "7", null])("throws TypeError for the tab id %j", async (tabId) => {
    await expect(createChromeDeps(fakeChrome() as never).runInPage(tabId as never, {})).rejects.toThrow(/tabId/);
  });
});

describe("callPageApi (runs inside the page)", () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>)[PAGE_API_KEY];
  });

  it("calls the installed page API with the event", async () => {
    const fill = vi.fn(async () => ({ status: "filled", stepsCompleted: 1, totalSteps: 1 }));
    (globalThis as Record<string, unknown>)[PAGE_API_KEY] = { fill };
    await expect(callPageApi({ a: 1 })).resolves.toEqual({ status: "filled", stepsCompleted: 1, totalSteps: 1 });
    expect(fill).toHaveBeenCalledWith({ a: 1 });
  });

  it("returns an error outcome when the page script is not installed", async () => {
    await expect(callPageApi({})).resolves.toMatchObject({ status: "error", message: expect.stringMatching(/not loaded/) });
  });

  it("uses no outside variables, because Chrome sends only its source code to the page", () => {
    const source = callPageApi.toString();
    expect(source).not.toMatch(/PAGE_API_KEY|import|require/);
    expect(source).toContain('"__vtoolsEventFiller"');
  });
});
