import type { OptionCatalog } from "../../src/spec/validateEvent";

// Small slices of the real option lists in fixtures/pages/event-create.html
export const catalog: OptionCatalog = {
  category: [
    { value: "", label: "Select one ..." },
    { value: "1", label: "Professional" },
    { value: "2", label: "Technical" },
  ],
  timezone: [
    { value: "", label: " " },
    { value: "America/Denver", label: "(UTC-06:00) Mountain Time (US & Canada)" },
    { value: "America/New_York", label: "(UTC-04:00) Eastern Time (US & Canada)" },
  ],
  country: [
    { value: "", label: "" },
    { value: "36", label: "Canada" },
    { value: "221", label: "United States" },
  ],
};

/** Minimal valid in-person event with default (Standard) registration. */
export const validEvent: Readonly<Record<string, unknown>> = Object.freeze({
  "meeting[meeting_host][0][spoid]": "STB13781",
  "meeting[meeting_host][0][contact_email]": "branch@example.org",
  "meeting[title]": "Embedded Systems Workshop",
  "meeting[category_id]": "Technical",
  "meeting[start_time]": "10 Nov 2026 06:00 PM",
  "meeting[end_time]": "10 Nov 2026 08:00 PM",
  "meeting[tm_zone_info]": "Mountain Time (US & Canada)",
  "meeting[description]": "<p>Hands-on intro.</p>",
  "meeting[keywords]": "embedded workshop",
  "meeting[city]": "Example City",
  "meeting[country_id]": "United States",
});
