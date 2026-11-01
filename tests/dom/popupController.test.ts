import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import type { FillOutcome } from "../../src/page/outcome";
import { createPopupController, type PopupDeps } from "../../src/popup/popupController";
import { renderMessages } from "../../src/popup/renderMessages";

const popupHtml = readFileSync(new URL("../../popup.html", import.meta.url), "utf8");
const CREATE_URL = "https://events.vtools.ieee.org/tego_/event/create";
const event = { "meeting[title]": "Workshop", "meeting[city]": "Example City" };

function setup(overrides: Partial<PopupDeps> = {}) {
  const { window } = new JSDOM(popupHtml);
  const { document } = window;
  const deps: PopupDeps = {
    document,
    getActiveTab: vi.fn(async () => ({ id: 7, url: CREATE_URL })),
    runInPage: vi.fn(async (): Promise<FillOutcome> => ({ status: "filled", stepsCompleted: 12, totalSteps: 12 })),
    ...overrides,
  };
  const controller = createPopupController(deps);
  const button = document.getElementById("fill") as HTMLButtonElement;
  const result = document.getElementById("result")!;
  const fileOf = (text: string, name = "event.json") => new window.File([text], name, { type: "application/json" });
  return { window, document, deps, controller, button, result, fileOf };
}

describe("renderMessages", () => {
  const container = () => new JSDOM("<div id=r></div>").window.document.getElementById("r")!;

  it("shows a title and lines, tagged with the tone, replacing earlier content", () => {
    const el = container();
    renderMessages(el, { tone: "info", title: "Old", lines: ["old"] });
    renderMessages(el, { tone: "error", title: "Problem", lines: ["one", "two"] });
    expect(el.dataset.tone).toBe("error");
    expect(el.querySelector("strong")!.textContent).toBe("Problem");
    expect(Array.from(el.querySelectorAll("li"), (li) => li.textContent)).toEqual(["one", "two"]);
    expect(el.textContent).not.toContain("Old");
  });

  it("shows HTML from the JSON file as text, never as markup", () => {
    const el = container();
    renderMessages(el, { tone: "error", title: "<img src=x onerror=alert(1)>", lines: ['<script>alert("x")</script>'] });
    expect(el.querySelector("img, script")).toBeNull();
    expect(el.textContent).toContain("<img src=x onerror=alert(1)>");
  });

  it.each([
    [null, { tone: "info", title: "t", lines: [] }, /container/],
    ["#r", { tone: "info", title: "t", lines: [] }, /container/],
    ["el", { tone: "loud", title: "t", lines: [] }, /tone/],
    ["el", { tone: "info", title: 5, lines: [] }, /title/],
    ["el", { tone: "info", title: "t", lines: "one" }, /lines/],
    ["el", { tone: "info", title: "t", lines: [1] }, /lines/],
    ["el", null, /message/],
  ])("throws TypeError for bad input (%#)", (target, message, pattern) => {
    const el = target === "el" ? container() : target;
    expect(() => renderMessages(el as never, message as never)).toThrow(TypeError);
    expect(() => renderMessages(el as never, message as never)).toThrow(pattern);
  });
});

describe("createPopupController: setup", () => {
  it("starts with the Fill button disabled and no message", () => {
    const { button, result } = setup();
    expect(button.disabled).toBe(true);
    expect(result.textContent).toBe("");
  });

  it.each(["document", "getActiveTab", "runInPage"] as const)("throws TypeError when %s is missing", (key) => {
    const { window } = new JSDOM(popupHtml);
    const deps = { document: window.document, getActiveTab: vi.fn(), runInPage: vi.fn(), [key]: undefined };
    expect(() => createPopupController(deps as never)).toThrow(new RegExp(key));
  });

  it("throws when the pop-up page is missing an element, naming it", () => {
    const { window } = new JSDOM(popupHtml);
    window.document.getElementById("result")!.remove();
    expect(() => createPopupController({ document: window.document, getActiveTab: vi.fn(), runInPage: vi.fn() })).toThrow(/#result/);
  });
});

describe("createPopupController: loading a file", () => {
  it("loads a valid file, says how many fields it has, and enables Fill", async () => {
    const { controller, button, result, fileOf } = setup();
    await controller.loadFile(fileOf(JSON.stringify(event), "workshop.json"));
    expect(button.disabled).toBe(false);
    expect(result.dataset.tone).toBe("info");
    expect(result.textContent).toContain("workshop.json");
    expect(result.textContent).toContain("2 fields");
  });

  it.each([
    ["a publish key", JSON.stringify({ ...event, "meeting[publish]": false }), "This tool never publishes"],
    ["a duplicate key", '{"meeting[title]": "a", "meeting[title]": "b"}', "The JSON file has a duplicate key"],
    ["invalid JSON", "{nope", "The file is not valid JSON"],
  ])("rejects a file with %s and keeps Fill disabled", async (_label, text, title) => {
    const { controller, button, result, fileOf, deps } = setup();
    await controller.loadFile(fileOf(text));
    expect(button.disabled).toBe(true);
    expect(result.dataset.tone).toBe("error");
    expect(result.querySelector("strong")!.textContent).toBe(title);
    await expect(controller.fill()).rejects.toThrow(/Choose an event JSON file/);
    expect(deps.runInPage).not.toHaveBeenCalled();
  });

  it("forgets a previously loaded file when a bad one is chosen", async () => {
    const { controller, fileOf, deps } = setup();
    await controller.loadFile(fileOf(JSON.stringify(event)));
    await controller.loadFile(fileOf("{nope"));
    await expect(controller.fill()).rejects.toThrow(/Choose an event JSON file/);
    expect(deps.runInPage).not.toHaveBeenCalled();
  });

  it("loads the file chosen in the file input", async () => {
    const { document, button, fileOf } = setup();
    const input = document.getElementById("event-file") as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [fileOf(JSON.stringify(event))] });
    input.dispatchEvent(new document.defaultView!.Event("change"));
    await vi.waitFor(() => expect(button.disabled).toBe(false));
  });

  it("throws TypeError when loadFile gets something that is not a file", async () => {
    const { controller } = setup();
    await expect(controller.loadFile("event.json" as never)).rejects.toThrow(/file must be a File/);
  });
});

describe("createPopupController: filling", () => {
  it("sends the parsed event to the active Create Event tab and reports success without saving", async () => {
    const { controller, deps, result, fileOf } = setup();
    await controller.loadFile(fileOf(JSON.stringify(event)));
    await controller.fill();
    expect(deps.runInPage).toHaveBeenCalledWith(7, event);
    expect(result.dataset.tone).toBe("success");
    expect(result.textContent).toContain("12");
    expect(result.textContent).toMatch(/Save as Draft/);
    expect(result.textContent).toMatch(/Nothing has been saved/);
    expect(result.textContent).toMatch(/autosave/i);
  });

  it("disables Fill while running and re-enables it afterwards", async () => {
    let disabledDuringRun: boolean | undefined;
    const { controller, button, fileOf } = setup({
      runInPage: vi.fn(async () => {
        disabledDuringRun = button.disabled;
        return { status: "filled", stepsCompleted: 1, totalSteps: 1 } as const;
      }),
    });
    await controller.loadFile(fileOf(JSON.stringify(event)));
    await controller.fill();
    expect(disabledDuringRun).toBe(true);
    expect(button.disabled).toBe(false);
  });

  it("does not touch a tab that is not the Create Event page", async () => {
    const { controller, deps, result, fileOf } = setup({
      getActiveTab: vi.fn(async () => ({ id: 3, url: "https://events.vtools.ieee.org/tego_/event/edit/9" })),
    });
    await controller.loadFile(fileOf(JSON.stringify(event)));
    await controller.fill();
    expect(deps.runInPage).not.toHaveBeenCalled();
    expect(result.querySelector("strong")!.textContent).toBe("Open the vTools Create Event page first");
  });

  it("shows a failed step with the autosave warning", async () => {
    const { controller, result, button, fileOf } = setup({
      runInPage: vi.fn(async (): Promise<FillOutcome> => ({
        status: "step-failed",
        stepIndex: 2,
        totalSteps: 10,
        step: { kind: "set-text", name: "meeting[title]", value: "x" },
        message: "Step 3 of 10 failed: missing",
      })),
    });
    await controller.loadFile(fileOf(JSON.stringify(event)));
    await controller.fill();
    expect(result.dataset.tone).toBe("error");
    expect(result.querySelector("strong")!.textContent).toBe("Stopped at step 3 of 10");
    expect(result.textContent).toMatch(/autosave/i);
    expect(button.disabled).toBe(false);
  });

  it("shows unexpected errors from Chrome", async () => {
    const { controller, result, fileOf } = setup({ runInPage: vi.fn(async () => Promise.reject(new Error("Cannot access contents of the page"))) });
    await controller.loadFile(fileOf(JSON.stringify(event)));
    await controller.fill();
    expect(result.querySelector("strong")!.textContent).toBe("Something went wrong");
    expect(result.textContent).toContain("Cannot access contents of the page");
  });

  it("rejects and explains when no file has been loaded", async () => {
    const { controller, result } = setup();
    await expect(controller.fill()).rejects.toThrow(/Choose an event JSON file/);
    expect(result.textContent).toMatch(/Choose an event JSON file/);
  });

  it("runs when the Fill button is clicked", async () => {
    const { controller, button, deps, fileOf } = setup();
    await controller.loadFile(fileOf(JSON.stringify(event)));
    button.click();
    await vi.waitFor(() => expect(deps.runInPage).toHaveBeenCalledTimes(1));
  });
});
