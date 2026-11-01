# vTools Event Filler

A Chrome extension (Manifest V3) that fills the IEEE vTools **Create an Event** form
(`https://events.vtools.ieee.org/tego_/event/create`) from a JSON file, then stops so the
person can review the form and click **Save as Draft** themselves. The extension never
saves, publishes, or cancels.

## Input format

One JSON object per event. Each key is the form field's HTML `name` attribute exactly as it
appears on the vTools page; each value is what that field should hold.
See `fixtures/events/example-event.json`.

| Field kind | Value |
|---|---|
| Text inputs | string |
| Selects (`category_id`, `tm_zone_info`, `country_id`, `state_id`, …) | the visible label (`"United States"`, case-insensitive; time zones may omit the `(UTC±hh:mm)` prefix) **or** the option ID (`"221"` / `221`). Unknown labels, unknown IDs, negative IDs, empty values, and labels that match several different IDs are errors, and the fill stops. |
| Radios (`meeting[location_type]`) | the radio's value: `virtual` / `hybrid` / `physical` |
| Checkboxes | `true` / `false` |
| Date/times | vTools display format `DD MMM YYYY hh:mm A`, e.g. `10 Nov 2026 06:00 PM` |
| Rich-text (description, agenda, header, footer, bios) | HTML string |

Never include `meeting[publish]` — the tool refuses to publish.

## Layout

```
src/spec/       JSON → validated event (field rules from the page's tooltips)
src/format/     date and HTML formatting helpers
src/plan/       validated event → ordered list of fill steps (pure)
src/executor/   runs steps against the live page (jQuery, TinyMCE, date pickers)
src/verify/     reads the form back and diffs against the JSON
src/popup/      extension popup: choose JSON file, run, show report
tests/unit/     Vitest, pure logic
tests/dom/      Vitest + jsdom against the sanitized page fixture
tests/e2e/      Playwright against a locally served fixture with mocked vTools endpoints
fixtures/pages/ sanitized copies of the vTools page (raw captures are git-ignored)
fixtures/events/ example input JSON files
```

## Scripts

- `npm test`: unit + DOM tests
- `npm run test:watch`: TDD loop
- `npm run test:e2e`: Playwright (first run `npx playwright install chromium`)
- `npm run build`: build the extension into `dist/`, then load it unpacked via `chrome://extensions`

## Testing rule

Automated tests never touch the real vTools site. Opening the real form starts autosave,
which creates draft events on IEEE's server.
