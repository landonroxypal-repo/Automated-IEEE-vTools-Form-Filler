export interface RichTextEditor {
  setContent(html: string): void;
  save(): void;
}

export interface DateTimePicker {
  /** Sets the picker's date from text in its own format ("DD MMM YYYY hh:mm A" on vTools). */
  date(value: string): void;
}

/** Everything the executor needs from the page. Each lookup throws rather than returning nothing. */
export interface PageEnv {
  document: Document;
  richTextEditor(textareaId: string): RichTextEditor;
  dateTimePicker(container: Element): DateTimePicker;
  sleep(ms: number): Promise<void>;
}

interface TinyMceEditor extends RichTextEditor {
  initialized: boolean;
}

/** The parts of the vTools page's window used here (the page provides TinyMCE and jQuery globally). */
export interface VtoolsWindow {
  document: Document;
  setTimeout(handler: () => void, ms: number): unknown;
  tinymce: { get(id: string): TinyMceEditor | null };
  jQuery(element: Element): { data(key: string): unknown };
}

/** Builds a PageEnv from the live vTools page's window. */
export function createPageEnv(window: VtoolsWindow): PageEnv {
  if (typeof window !== "object" || window === null) throw new TypeError("window must be the page's window object");
  const missing = (["document", "tinymce", "jQuery", "setTimeout"] as const).filter((key) => !window[key]);
  if (missing.length > 0) {
    throw new TypeError(`window must provide ${missing.join(", ")}; is this the vTools Create Event page?`);
  }

  return {
    document: window.document,

    richTextEditor(textareaId) {
      const editor = window.tinymce.get(textareaId);
      if (!editor) throw new Error(`no rich-text editor for #${textareaId}`);
      if (!editor.initialized) throw new Error(`rich-text editor for #${textareaId} is not ready yet`);
      return editor;
    },

    dateTimePicker(container) {
      const picker = window.jQuery(container).data("DateTimePicker") as DateTimePicker | undefined;
      if (!picker || typeof picker.date !== "function") {
        throw new Error(`no date/time picker on #${container.id || container.tagName.toLowerCase()}`);
      }
      return picker;
    },

    sleep: (ms) => new Promise((resolve) => window.setTimeout(resolve, ms)),
  };
}
