import type { SelectOption } from "../spec/resolveOption";
import type { OptionCatalog } from "../spec/validateEvent";

const CATALOG_SOURCES = {
  category: "meeting[category_id]",
  timezone: "meeting[tm_zone_info]",
  country: "meeting[country_id]",
} as const;

/** Reads a <select>'s options by its name attribute. Throws if it is missing or has nothing to choose. */
export function readSelectOptions(document: Document, name: string): SelectOption[] {
  if (typeof document?.getElementsByName !== "function") {
    throw new TypeError("document must be a Document");
  }
  if (typeof name !== "string" || name.trim() === "") {
    throw new TypeError(`name must be a non-empty string, got ${JSON.stringify(name)}`);
  }

  const element = document.getElementsByName(name)[0];
  if (!element) throw new Error(`No element named "${name}" found on the page`);
  // Checked by tag rather than instanceof, which fails for documents without a window.
  if (element.tagName !== "SELECT") {
    throw new Error(`Element named "${name}" is a <${element.tagName.toLowerCase()}>, not a <select>`);
  }

  const options = Array.from((element as HTMLSelectElement).options, (o) => ({ value: o.value, label: o.text.trim() }));
  if (!options.some((o) => o.value !== "")) {
    throw new Error(`<select name="${name}"> has no selectable options`);
  }
  return options;
}

/** Reads the option lists that are present when the Create Event page first loads. */
export function readOptionCatalog(document: Document): OptionCatalog {
  return {
    category: readSelectOptions(document, CATALOG_SOURCES.category),
    timezone: readSelectOptions(document, CATALOG_SOURCES.timezone),
    country: readSelectOptions(document, CATALOG_SOURCES.country),
  };
}
