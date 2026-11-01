import type { SelectOption } from "../spec/resolveOption";
import type { OptionCatalog } from "../spec/validateEvent";

const CATALOG_SOURCES = {
  category: "meeting[category_id]",
  timezone: "meeting[tm_zone_info]",
  country: "meeting[country_id]",
} as const;

export function readSelectOptions(document: Document, name: string): SelectOption[] {
  const select = document.getElementsByName(name)[0];
  if (!(select instanceof document.defaultView!.HTMLSelectElement)) {
    throw new Error(`No <select name="${name}"> found on the page`);
  }
  return Array.from(select.options, (o) => ({ value: o.value, label: o.text.trim() }));
}

/** Reads the option lists that are present when the Create Event page first loads. */
export function readOptionCatalog(document: Document): OptionCatalog {
  return {
    category: readSelectOptions(document, CATALOG_SOURCES.category),
    timezone: readSelectOptions(document, CATALOG_SOURCES.timezone),
    country: readSelectOptions(document, CATALOG_SOURCES.country),
  };
}
