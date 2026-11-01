# vTools Event Filler

A Chrome extension (Manifest V3) that fills the IEEE vTools **Create an Event** form
(`https://events.vtools.ieee.org/tego_/event/create`) from a JSON file, then stops so the
person can review the form and click **Save as Draft** themselves. The extension never
saves, publishes, or cancels.

## Filling out the event JSON file

### The basics

- One file describes **one event**, as a single JSON object: `{ "key": value, "key": value }`.
- Each **key** is the HTML `name` of a field on the Create Event form, written exactly as listed
  in the tables below (brackets included, e.g. `"meeting[title]"`).
- **Leave a field out** to leave it blank. An empty string (`""`) for an optional text field also
  means "leave blank".
- The file must be strict JSON: double quotes around every key and string, no trailing commas,
  no comments, and no key written twice (the pop-up rejects duplicate keys and says which line).
- Any key the tool doesn't recognize is an error, including a misspelling. The pop-up lists every
  problem at once, and nothing is filled until all of them are fixed.
- **Never include `meeting[publish]`** (or any key mentioning "publish"). The file is refused.

Ready-made examples are in `fixtures/events/`: `example-event.json` and `manual-test.json`
(in-person), `manual-test-virtual.json`, and `manual-test-hybrid.json`.

### Kinds of values

| Kind | Write it as | Example |
|---|---|---|
| Text | a string | `"Embedded Systems Workshop"` |
| Rich text (the boxes with an editor toolbar) | an HTML string; `<script>` tags are not allowed | `"<p>Bring a <strong>laptop</strong>.</p>"` |
| Dropdown | the **visible label** (any capitalization) **or** the option's ID | `"United States"` or `"221"` or `221` |
| Radio button | the visible label or the form's value | `"In-Person"` or `"physical"` |
| Checkbox | `true` or `false` (not `"true"`) | `true` |
| Date/time | `DD MMM YYYY hh:mm AM/PM`, exactly as the date picker shows it; years 2000–2099 | `"10 Nov 2026 06:00 PM"` |
| Number | a whole number, as a number or a string; never negative | `40` or `"40"` |
| Email | a string | `"chair@example.org"` |
| Web address | a string starting with `http://` or `https://` | `"https://example.org/survey"` |

Single-line text fields cannot contain line breaks or tabs. Multi-line fields (Tags/Keywords and
all rich-text fields) may contain line breaks (`\n`) and tabs (`\t`).

A dropdown label that doesn't match, a label that matches several different options, or an ID
that isn't in the list stops the tool with a message naming the field. For **State/Province** and
**Sub-category**, vTools loads the list only after the Country or Category is chosen, so those two
are checked during the fill rather than before it.

### Host section

| Form label | JSON key | Value | Required | Limit |
|---|---|---|---|---|
| Host Organizational Unit | `meeting[meeting_host][0][spoid]` | the unit's code, as typed into the picker, e.g. `"STB13781"` | Yes | |
| Host Contact Email | `meeting[meeting_host][0][contact_email]` | email | Yes | 512 |
| Registration Notify Immediately | `meeting[meeting_host][0][contact_registration_notification]` | checkbox | | |
| Enable Co-Host URL | `meeting[enable_cohost_url]` | checkbox | | |
| Cosponsor Name | `meeting[cosponsor_name]` | text | | 256 |
| Extra Contact Information | `meeting[contact_display]` | rich text | | 512 |

### Details section

| Form label | JSON key | Value | Required | Limit |
|---|---|---|---|---|
| Title | `meeting[title]` | text | Yes | 256 |
| Category | `meeting[category_id]` | dropdown: `Professional`, `Technical`, `Nontechnical`, `Administrative`, `Humanitarian`, `Pre-U STEM Program` | Yes | |
| Sub-category | `meeting[subcategory_id]` | dropdown (see below) | Only if you give one; needs a Category | |
| Start time | `meeting[start_time]` | date/time | Yes | |
| End time | `meeting[end_time]` | date/time; after the start, and at most 5 days after it | Yes | |
| Time Zone | `meeting[tm_zone_info]` | dropdown: the label with or without its `(UTC±hh:mm)` prefix, e.g. `"Mountain Time (US & Canada)"`, or the zone ID, e.g. `"America/Denver"` | Yes | |
| Description | `meeting[description]` | rich text | Yes | 8,192 |
| Header | `meeting[header]` | rich text | | 512 |
| Footer | `meeting[footer]` | rich text | | 512 |
| Agenda | `meeting[agenda]` | rich text | | 8,192 |
| Tags/Keywords | `meeting[keywords]` | multi-line text | Yes | 512 |
| Survey URL | `meeting[survey_url]` | web address | | 512 |

Sub-categories by category, as listed on the form (Technical has none):

| Category | Sub-categories |
|---|---|
| Administrative | `ExCom`, `Officer Training` |
| Humanitarian | `Other`, `SIGHT` |
| Nontechnical | `Awards Dinner`, `Nontechnical (Other)`, `Pre-University Activities`, `Social` |
| Pre-U STEM Program | `Camp`, `Career Day`, `Competition/STEM Fairs`, `Girls in STEM`, `Industry/Company Tour`, `Mentoring`, `Parent Program`, `Student Workshop`, `Teacher Workshop` |
| Professional | `Continuing Education`, `Industry Relations`, `Professional (Other)`, `Professional Development` |

These names come from the form's help text, shortened where the help text adds a description
(e.g. "SIGHT - Special Interest Group on Humanitarian Technology"), so the dropdown's own label may
be longer. `ExCom` and `Professional Development` have been confirmed on the live form; if another
one is rejected, copy its exact text from the Sub-category dropdown.

### Location section

First choose the event type. It decides which of the other location fields you may (and must) give.

| Form label | JSON key | Value | Required | Limit |
|---|---|---|---|---|
| What type of event is this? | `meeting[location_type]` | `"Virtual"`, `"Hybrid"`, or `"In-Person"` (or `virtual` / `hybrid` / `physical`) | No: defaults to In-Person | |
| Virtual Attendance Info | `meeting[virtual_info]` | rich text | Virtual and Hybrid only, and required for them | |
| Address Line 1 | `meeting[address1]` | text | | 128 |
| Address Line 2 | `meeting[address2]` | text | | 128 |
| City | `meeting[city]` | text | In-Person and Hybrid | 128 |
| Country/Region | `meeting[country_id]` | dropdown, e.g. `"United States"`, `"Canada"` | In-Person and Hybrid | |
| State/Province | `meeting[state_id]` | dropdown, e.g. `"Colorado"`, `"Ontario"`; needs a Country | | |
| Postal Code | `meeting[postal_code]` | text | | 16 |
| Building | `meeting[building]` | text | | 128 |
| Room Number | `meeting[room_number]` | text | | 48 |
| Map URL | `meeting[map_url]` | web address | | 512 |
| Override Latitude | `meeting[user_override_latitude]` | number from -90 to 90 (decimals allowed) | | |
| Override Longitude | `meeting[user_override_longitude]` | number from -180 to 180 (decimals allowed) | | |

Every field after Virtual Attendance Info is for In-Person and Hybrid events only. Giving any of
them for a Virtual event is an error, and so is giving Virtual Attendance Info for an In-Person event.

### Registration section

First choose the registration type. It decides which of the other registration fields apply.

| Form label | JSON key | Value | Applies to | Limit |
|---|---|---|---|---|
| Registration type (radio buttons) | `_registration_type` | `"Standard"`, `"External"`, or `"None"`; optional, defaults to Standard | (decides the rows below) | |
| Registration starts | `meeting[reg_start_time]` | date/time | Standard | |
| Registration ends | `meeting[reg_end_time]` | date/time; after registration starts | Standard | |
| Maximum In-Person Registrations | `meeting[max_registrations]` | whole number 0–999 | Standard | |
| Maximum Virtual Registrations | `meeting[max_registrations_virtual]` | whole number 0–999 | Standard | |
| Require IEEE Event Terms and Conditions Consent | `meeting[require_terms]` | checkbox (checked on the form by default) | Standard | |
| External Registration URL | `meeting[registration_url]` | web address; **required** for External | External | 512 |

If you leave out the registration dates with Standard registration, vTools fills them in itself
when the start time is set: registration opens at midnight tomorrow and closes at midnight at the
start of the event's day.
Giving a field for a registration type it doesn't apply to is an error.

### Speakers section

Speaker keys look like `speakers[speaker1][topic]`. Replace the `1` with the speaker's number.

- Number speakers **1, 2, 3, … with no gaps**. A speaker whose values are all blank counts as
  missing.
- The form starts with two speaker panels; the tool clicks **Add speaker** for each one beyond that.
- If you give a speaker's first or last name, you must also give their **Preferred Name**.

| Form label | Key after `speakers[speakerN]` | Value | Limit |
|---|---|---|---|
| Topic | `[topic]` | text | 120 |
| Distinguished Lecturer | `[dlp_speaker]` | checkbox | |
| Description | `[topic_description]` | rich text | |
| Prefix | `[prefix]` | text | 16 |
| Given/First Name(s) | `[first_name]` | text | 200 |
| Middle Name | `[middle_name]` | text | 200 |
| Family/Last Name(s) | `[last_name]` | text | 200 |
| Suffix | `[suffix]` | text | 32 |
| Preferred Name | `[display_name]` | text | 256 |
| URL | `[speaker_url]` | web address | 512 |
| Address Line 1 | `[address1]` | text | 128 |
| Address Line 2 | `[address2]` | text | 128 |
| City | `[city]` | text | 128 |
| Country/Region | `[country_id]` | dropdown | |
| State/Province | `[state_id]` | dropdown; needs the speaker's Country | |
| Postal Code | `[postal_code]` | text | 64 |
| Email Address | `[email]` | email | 128 |
| Biography | `[biography]` | rich text | 8,192 |
| Organization | `[organization]` | text | 256 |

### Report and Attendance section

| Form label | JSON key | Value |
|---|---|---|
| IEEE Attended | `meeting[ieee_attending]` | whole number, 0 or more |
| Guests Attended | `meeting[guests_attending]` | whole number, 0 or more |

### Not supported yet

Fill these in by hand after the tool finishes. The tool rejects keys for payment and pricing
(registration fees), co-hosts, custom registration questions, and menu selections. The "Is this a
Women in Engineering (WIE) event?" checkbox has no field name on the form, so it has no key at all.

### A complete example

A virtual event with external registration and one speaker:

```json
{
  "meeting[meeting_host][0][spoid]": "STB13781",
  "meeting[meeting_host][0][contact_email]": "chair@example.org",

  "meeting[title]": "Careers in Embedded Systems",
  "meeting[category_id]": "Professional",
  "meeting[subcategory_id]": "Professional Development",
  "meeting[start_time]": "08 Dec 2026 12:00 PM",
  "meeting[end_time]": "08 Dec 2026 01:00 PM",
  "meeting[tm_zone_info]": "Eastern Time (US & Canada)",
  "meeting[description]": "<p>A panel on careers in embedded systems.</p>",
  "meeting[keywords]": "careers embedded",

  "meeting[location_type]": "Virtual",
  "meeting[virtual_info]": "<p>Join at https://example.org/meeting</p>",

  "_registration_type": "External",
  "meeting[registration_url]": "https://example.org/register",

  "speakers[speaker1][topic]": "From student to firmware engineer",
  "speakers[speaker1][first_name]": "Jane",
  "speakers[speaker1][last_name]": "Doe",
  "speakers[speaker1][display_name]": "Jane Doe"
}
```

## Layout

```
src/spec/        JSON → validated event (field rules from the page's tooltips)
src/format/      date parsing
src/plan/        validated event → ordered list of fill steps
src/executor/    runs the steps on the page (TinyMCE, date pickers, dropdowns)
src/page/        entry point injected into the vTools page (bundled as page.js)
src/popup/       extension pop-up: choose a JSON file, check it, fill, show the result
tests/unit/      Vitest, pure logic
tests/dom/       Vitest + jsdom against the sanitized page fixture
fixtures/pages/  sanitized copy of the vTools page (raw captures are git-ignored)
fixtures/events/ example and manual-test event JSON files
```

## Scripts

- `npm test`: all automated tests
- `npm run test:watch`: TDD loop
- `npm run typecheck`: TypeScript check
- `npm run build`: build the extension into `dist/`, then load it unpacked via `chrome://extensions`

## Using it

1. `npm run build`, then in Chrome open `chrome://extensions`, turn on Developer mode, click
   **Load unpacked**, and choose the `dist/` folder.
2. Sign in to vTools and open **Create an Event** (`https://events.vtools.ieee.org/tego_/event/create`).
3. Click the extension's icon, choose your event JSON file, and click **Fill form**.
4. Review every section, then click **Save as Draft** yourself. The tool never saves or publishes.

The pop-up checks the file before anything touches the page (valid JSON, no duplicate keys, no
publish keys). The page itself then checks every field against its own option lists before filling.
If a step fails partway, earlier fields stay filled and vTools may already have autosaved a draft.

## Testing rule

Automated tests never touch the real vTools site. Opening the real form starts autosave,
which creates draft events on IEEE's server.
