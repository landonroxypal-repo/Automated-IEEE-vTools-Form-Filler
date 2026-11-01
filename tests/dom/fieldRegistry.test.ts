import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { readOptionCatalog } from "../../src/executor/readOptionCatalog";
import { MEETING_FIELDS, SPEAKER_FIELDS } from "../../src/spec/fields";
import { validateEvent } from "../../src/spec/validateEvent";

const html = readFileSync(new URL("../../fixtures/pages/event-create.html", import.meta.url), "utf8");
const { document } = new JSDOM(html).window;

const byName = (name: string): Element | null => document.getElementsByName(name)[0] ?? null;

// The field registry is written by hand, so check it against the real page.
describe("field registry matches the vTools page", () => {
  const all = [
    ...Object.entries(MEETING_FIELDS),
    ...Object.entries(SPEAKER_FIELDS).map(([prop, def]) => [`speakers[speaker1][${prop}]`, def] as const),
  ];

  it.each(all)("%s exists on the page", (name) => {
    expect(byName(name)).not.toBeNull();
  });

  it.each(all.filter(([name]) => byName(name)?.hasAttribute("maxlength")))(
    "%s uses the page's maxlength",
    (name, def) => {
      expect(def.maxLength).toBe(Number(byName(name)!.getAttribute("maxlength")));
    },
  );

  it("never lists meeting[publish] as fillable", () => {
    expect(Object.keys(MEETING_FIELDS).some((k) => /publish/i.test(k))).toBe(false);
  });
});

describe("readOptionCatalog", () => {
  const catalog = readOptionCatalog(document);

  it("reads the static option lists from the page", () => {
    expect(catalog.category).toContainEqual({ value: "2", label: "Technical" });
    expect(catalog.country).toContainEqual({ value: "221", label: "United States" });
    expect(catalog.timezone).toContainEqual({ value: "America/Denver", label: "(UTC-06:00) Mountain Time (US & Canada)" });
  });

  it("validates the example event against the real option lists", () => {
    const example = JSON.parse(
      readFileSync(new URL("../../fixtures/events/example-event.json", import.meta.url), "utf8"),
    );
    const result = validateEvent(example, catalog);
    expect(result.values["meeting[country_id]"]).toBe("221");
    expect(result.values["meeting[category_id]"]).toBe("2");
  });
});
