import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { readOptionCatalog, readSelectOptions } from "../../src/executor/readOptionCatalog";
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

describe("readSelectOptions / readOptionCatalog: invalid input", () => {
  const page = (body: string) => new JSDOM(`<!doctype html><body>${body}</body>`).window.document;

  it("throws when no element has the name", () => {
    expect(() => readSelectOptions(page(""), "meeting[country_id]")).toThrow(/meeting\[country_id\]/);
  });

  it("throws when the named element is not a <select>", () => {
    expect(() => readSelectOptions(page('<input name="meeting[country_id]">'), "meeting[country_id]")).toThrow(/select/);
  });

  it("throws when the select has only a placeholder option", () => {
    const doc = page('<select name="meeting[country_id]"><option value=""></option></select>');
    expect(() => readSelectOptions(doc, "meeting[country_id]")).toThrow(/no selectable options/);
  });

  it("works on a document without a window", () => {
    const doc = new JSDOM("").window.document.implementation.createHTMLDocument("");
    doc.body.innerHTML = '<select name="x"><option value="1">One</option></select>';
    expect(readSelectOptions(doc, "x")).toEqual([{ value: "1", label: "One" }]);
  });

  it.each([null, undefined, {}, "document"])("throws TypeError for a non-document %j", (doc) => {
    expect(() => readSelectOptions(doc as unknown as Document, "x")).toThrow(TypeError);
    expect(() => readSelectOptions(doc as unknown as Document, "x")).toThrow(/document must be a Document/);
  });

  it.each([null, "", 5])("throws TypeError for an invalid name %j", (name) => {
    expect(() => readSelectOptions(document, name as string)).toThrow(TypeError);
    expect(() => readSelectOptions(document, name as string)).toThrow(/name must be a non-empty string/);
  });

  it("throws when a page is missing one of the catalog selects", () => {
    const doc = page(
      '<select name="meeting[category_id]"><option value="2">Technical</option></select>' +
        '<select name="meeting[tm_zone_info]"><option value="Etc/UTC">UTC</option></select>',
    );
    expect(() => readOptionCatalog(doc)).toThrow(/meeting\[country_id\]/);
  });
});
