import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import type { DateTimePicker, PageEnv, RichTextEditor } from "../../src/executor/pageEnv";

const html = readFileSync(new URL("../../fixtures/pages/event-create.html", import.meta.url), "utf8");

type Options = [value: string, label: string][];

export interface FakePageOptions {
  /** Delay for simulated AJAX, Bootstrap transitions, and "Add speaker". */
  delayMs?: number;
  bootstrap?: boolean;
  addSpeaker?: boolean;
  subcategories?: Record<string, Options>;
  states?: Record<string, Options>;
}

export interface FakeEditor extends RichTextEditor {
  content: string;
}

export interface FakePage {
  window: JSDOM["window"];
  document: Document;
  env: PageEnv;
  editors: Map<string, FakeEditor>;
  pickers: Map<Element, DateTimePicker>;
  /** Every element that received a click, in order. */
  clicks: Element[];
}

const DEFAULT_SUBCATEGORIES: Record<string, Options> = {
  "4": [
    ["10", "ExCom"],
    ["11", "Officer Training"],
  ],
};
const DEFAULT_STATES: Record<string, Options> = {
  "221": [
    ["6", "Colorado"],
    ["44", "Texas"],
  ],
  "36": [["9", "Ontario"]],
};

const selectHtml = (name: string, placeholder: string, options: Options) =>
  `<select name="${name}" class="form-control"><option value="">${placeholder}</option>` +
  options.map(([v, l]) => `<option value="${v}">${l}</option>`).join("") +
  "</select>";

/**
 * The sanitized Create Event page with stand-ins for what the real page does with Bootstrap,
 * TinyMCE, the date pickers, and its AJAX calls. Inline page scripts never run.
 */
export function loadFakePage(options: FakePageOptions = {}): FakePage {
  const { delayMs = 10, bootstrap = true, addSpeaker = true } = options;
  const subcategories = options.subcategories ?? DEFAULT_SUBCATEGORIES;
  const states = options.states ?? DEFAULT_STATES;

  const dom = new JSDOM(html);
  const { window } = dom;
  const { document } = window;
  const later = (fn: () => void) => window.setTimeout(fn, delayMs);

  const editors = new Map<string, FakeEditor>();
  const registerEditors = (root: ParentNode) => {
    for (const textarea of Array.from(root.querySelectorAll<HTMLTextAreaElement>("textarea.tinymce"))) {
      editors.set(textarea.id, {
        content: "",
        setContent(html: string) {
          this.content = html;
        },
        save() {
          textarea.value = this.content;
        },
      });
    }
  };
  registerEditors(document);

  const pickers = new Map<Element, DateTimePicker>();
  for (const container of Array.from(document.querySelectorAll(".input-group.date"))) {
    const input = container.querySelector("input")!;
    pickers.set(container, {
      date(value: string) {
        input.value = value;
      },
    });
  }

  const clicks: Element[] = [];
  document.addEventListener("click", (e) => clicks.push(e.target as Element), true);

  document.addEventListener("click", (e) => {
    const target = e.target as Element;
    const toggle = target.closest('a[data-toggle="collapse"]');
    if (toggle) {
      e.preventDefault();
      if (bootstrap) later(() => document.getElementById(toggle.getAttribute("href")!.slice(1))?.classList.add("in"));
      return;
    }
    if (target.closest("#_add_speaker")) {
      e.preventDefault();
      if (!addSpeaker) return;
      later(() => {
        const n = document.querySelectorAll("._speaker_container").length + 1;
        const template = document.getElementById("_event_speaker1")!.outerHTML.replace(/speaker1/g, `speaker${n}`);
        const holder = document.createElement("div");
        holder.innerHTML = template;
        const panel = holder.firstElementChild!;
        document.getElementById("meeting_speakers")!.append(panel);
        registerEditors(panel);
      });
    }
  });

  document.addEventListener("change", (e) => {
    const target = e.target as HTMLSelectElement;
    if (target.name === "meeting[category_id]") {
      later(() => {
        document.getElementById("_select_subcategory")!.innerHTML = selectHtml(
          "meeting[subcategory_id]",
          "Select one ...",
          subcategories[target.value] ?? [],
        );
      });
      return;
    }
    const country = /^(meeting|speakers\[speaker(\d+)\])\[country_id\]$/.exec(target.name);
    if (country) {
      const containerId = country[2] ? `speakers_speaker${country[2]}_stateselect` : "meetingstateselect";
      const stateName = target.name.replace("[country_id]", "[state_id]");
      const container = document.getElementById(containerId)!;
      container.innerHTML = '<span class="fa fa-cog fa-spin fa-2x"></span>';
      later(() => {
        container.innerHTML = selectHtml(stateName, "", states[target.value] ?? []);
      });
    }
  });

  const env: PageEnv = {
    document,
    richTextEditor(id) {
      const editor = editors.get(id);
      if (!editor) throw new Error(`no rich-text editor for #${id}`);
      return editor;
    },
    dateTimePicker(container) {
      const picker = pickers.get(container);
      if (!picker) throw new Error("no date/time picker");
      return picker;
    },
    sleep: (ms) => new Promise((resolve) => window.setTimeout(resolve, ms)),
  };

  return { window, document, env, editors, pickers, clicks };
}
