import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { createPageEnv } from "../../src/executor/pageEnv";

function fakeWindow(overrides: Record<string, unknown> = {}) {
  const { window } = new JSDOM('<div class="input-group date" id="picker"><input></div><textarea id="desc"></textarea>');
  const editor = { initialized: true, setContent() {}, save() {} };
  const picker = { date() {} };
  const pickerEl = window.document.getElementById("picker");
  return {
    document: window.document,
    setTimeout: window.setTimeout.bind(window),
    tinymce: { get: (id: string) => (id === "desc" ? editor : null) },
    jQuery: (el: Element) => ({ data: (key: string) => (el === pickerEl && key === "DateTimePicker" ? picker : undefined) }),
    ...overrides,
    _editor: editor,
    _picker: picker,
    _pickerEl: pickerEl!,
  };
}

describe("createPageEnv", () => {
  it.each([null, undefined, {}, "window"])("throws TypeError for %j", (win) => {
    expect(() => createPageEnv(win as never)).toThrow(/window must/);
  });

  it.each(["document", "tinymce", "jQuery", "setTimeout"])("throws TypeError when window.%s is missing", (key) => {
    expect(() => createPageEnv(fakeWindow({ [key]: undefined }) as never)).toThrow(new RegExp(key));
  });

  it("returns the TinyMCE editor for a textarea id", () => {
    const win = fakeWindow();
    expect(createPageEnv(win as never).richTextEditor("desc")).toBe(win._editor);
  });

  it("throws when TinyMCE has no editor for the id", () => {
    expect(() => createPageEnv(fakeWindow() as never).richTextEditor("missing")).toThrow(/no rich-text editor.*#missing/);
  });

  it("throws when the editor exists but is not initialized yet", () => {
    const win = fakeWindow();
    win._editor.initialized = false;
    expect(() => createPageEnv(win as never).richTextEditor("desc")).toThrow(/not ready/);
  });

  it("returns the bootstrap-datetimepicker attached to a container", () => {
    const win = fakeWindow();
    expect(createPageEnv(win as never).dateTimePicker(win._pickerEl)).toBe(win._picker);
  });

  it("throws when the container has no date/time picker", () => {
    const win = fakeWindow();
    expect(() => createPageEnv(win as never).dateTimePicker(win.document.body)).toThrow(/no date\/time picker/);
  });

  it("sleeps using the page's setTimeout", async () => {
    const env = createPageEnv(fakeWindow() as never);
    const started = Date.now();
    await env.sleep(20);
    expect(Date.now() - started).toBeGreaterThanOrEqual(15);
  });
});
