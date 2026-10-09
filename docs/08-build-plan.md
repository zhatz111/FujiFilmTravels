# 08 — Build plan

Work through the phases in order. At the end of each phase: run checks and tests, summarize what changed, list how to verify it manually, and wait for Zach before starting the next phase.

## Phase 0 — Scaffold

- Create the repo layout from `CLAUDE.md`, `.gitignore` (photos/, config/pipeline.toml, .env, node_modules, .venv, pipeline/.cache), MIT or "All rights reserved" `LICENSE` `[DECIDE]` (photos are always all rights reserved).
- `site/`: SvelteKit + TS + adapter-static, prerender on, ESLint + Prettier, Vitest. pnpm scripts from `CLAUDE.md`.
- `pipeline/`: uv project, typer CLI skeleton with the four commands, pytest.
- Copy `data/*.example.json` to `data/*.json` so the site has sample data.

**Done when:** `pnpm dev` serves a blank page, `pnpm check` passes, `uv run pipeline --help` lists the commands.

## Phase 1 — Photo pipeline

- Implement `ingest` steps 1–10 from `04-photo-pipeline.md`, incremental manifest, pydantic schemas, `report`.
- Implement `trips` validation.
- Tests listed in `04-photo-pipeline.md`.

**Done when:** running `ingest` on Zach's sample photos produces derivatives without EXIF and valid `photos.json`, `spots.json`, `countries.json`, `visited-countries.geojson`; `report` shows sensible countries and spots; private-zone test passes.

## Phase 2 — Site shell and design system

- `tokens.css`, `base.css`, self-hosted fonts.
- Header, Hero (with stats from data), Footer, empty globe stage with sun + ridge backdrop, side panel with Destination list, Gallery with Country cards, all reading real data.
- `types.ts`, `data.ts`, `state.svelte.ts` with URL sync (no map yet; clicking destinations changes state and URL, gallery reacts).
- Responsive layout down to 360px wide.

**Done when:** the page matches the mockup's non-map parts at desktop and phone widths, and `/?c=<country>&s=<spot>` deep links show the right gallery.

## Phase 3 — Globe and navigation

- `Globe.svelte` with MapLibre globe, Alpine Morning base style (without contours yet), country/spot/photo HTML markers, breadcrumb, hint pill, legend.
- Camera choreography from `05-map-and-globe.md`, auto-rotate, reduced motion.
- Two-way sync: map clicks → state; state → camera + markers.

**Done when:** World → Country → Spot → Photo pin works with the described animations, back/forward works, markers behind the globe are hidden, and everything is keyboard-operable.

## Phase 4 — Gallery and lightbox

- Filter chips, masonry grid with `srcset`, lazy loading, placeholder colors.
- PhotoSwipe lightbox with custom info sidebar, URL param `p`, prev/next within filter, photo pin highlight.

**Done when:** opening a photo from a tile or a pin shows the correct photo and metadata; keyboard/swipe work; no layout shift while images load.

## Phase 4.5 — Visit dates

Show when Zach was at each place, so the site doubles as a travel log. Dates come from the photos themselves; no manual entry is needed.

**Data (pipeline):**
- Derive **visits** from each photo's `taken` date (local date at the photo's location). Within a country, sort photo dates and start a new visit whenever there's a gap of more than `visit_gap_days` (config, default 4). Each visit is `{ start: "YYYY-MM-DD", end: "YYYY-MM-DD", photos: n }`.
- Compute visits at two levels: per **country** (`Country.visits`) and per **spot** (`Spot.visits`, using the same gap rule within the spot).
- Optional overrides in `config/pipeline.toml` for when photo dates don't tell the whole story (e.g. arrived two days before the first photo), or to give a visit a name:
  ```toml
  [[visit_overrides]]
  country = "argentina"
  start = "2025-03-07"
  end = "2025-03-22"
  label = "Patagonia trip"   # optional
  ```
  An override replaces any derived visit it overlaps.
- Add to schemas: `Country.visits: Visit[]` and `Spot.visits: SpotVisit[]`, newest first. Keep `last_visit` as the end of the newest visit.
  ```ts
  type Visit = {            // one trip to a country
    id: string;             // "argentina-2025-03" (country + start year-month; add "-2" if two start the same month)
    start: string; end: string; photos: number; label?: string;
    companions: string[];   // person ids who were on the trip (Phase 4.6)
    photographers: string[];// person ids who took photos on this trip (Phase 4.6)
  };
  type SpotVisit = {        // the part of a trip spent at one spot
    visit: string;          // Visit.id it belongs to
    start: string; end: string; photos: number;
    people: string[];       // who was at this spot on this trip (Phase 4.6)
  };
  ```
  Each photo also gets `visit: string` (its Visit.id).

**Date formatting (`site/src/lib/dates.ts`, pure, unit tested):**
- Same month: "Mar 9 – 21, 2025". Across months: "Feb 27 – Mar 4, 2025". Across years: "Dec 28, 2024 – Jan 3, 2025". Single day: "Mar 14, 2025".
- Short form for tight spaces: "Mar 2025"; multiple visits short form: "Mar 2025 · Jan 2023" (show at most 2, then "+1 more").
- Use `Intl.DateTimeFormat` with English month abbreviations; treat dates as calendar dates (no time-zone shifting).

**Where dates appear (UI):**
- **Destination list (World panel):** under each country name, the short visit form ("Mar 2025") instead of coordinates.
- **Globe country pins:** label becomes "ARGENTINA · 2025" (most recent visit year; "2025 · 2023" for repeat visits).
- **Country cards (gallery):** meta line "Mar 2025 · 2 spots · 13 photos". The section's existing "most recent trip first" ordering uses `last_visit`.
- **Country panel header:** under the country name, "Visited Mar 9 – 21, 2025" (one line per visit if there are several, newest first, each with its label if set).
- **Spot rows and spot pins:** spot row shows the spot's date range ("Mar 9 – 11") next to the photo count; the spot pin's name chip gets a second, smaller mono line with the same range.
- **Spot level ring label:** "EL CHALTÉN · MAR 12 – 18, 2025 · 7 PHOTOS".
- **Gallery:** when a country has more than one visit, group the grid under small visit headings ("March 2025", "January 2023"), newest first. The lightbox already shows each photo's exact date.

**Done when:** dates in `countries.json` and `spots.json` match the photos, the formatter tests cover the cases above, Buenos Aires and El Chaltén each show their own date range inside one Argentina visit, and a country with two separate trips shows both visits everywhere listed above.

## Phase 4.6 — People, companions, and trip filters

The site stays static and Zach stays the only publisher. Friends and family send Zach their photos; the pipeline credits each photo to whoever took it and records who was on each trip. Visitors can filter the whole site by traveler and by trip from a single filter bar. See `reference/mockup-people-and-trips.html` for the approved layout.

**People (`data/people.json`, hand-edited, committed):**
```ts
type Person = {
  id: string;            // "zach", "alex", "mom"
  name: string;          // display name, first name or nickname only
  color: string;         // pin/avatar color from the person palette in 03-design-system.md
  initials?: string;     // defaults to first letters of name
  avatar?: string;       // optional small square photo, processed by the pipeline like other images
  relation?: string;     // "friend", "brother", ... (shown only in the people menu)
  show_photos?: boolean; // default true; false = can be tagged as a companion but none of their photos publish
  hidden?: boolean;      // default false; true = never shown anywhere (opt-out without deleting data)
};
```
Rules: only list people who've agreed to be on the site. Use first names or nicknames. For kids, use initials or leave them out.

**Pipeline:**
- Inbox becomes per person: `photos/inbox/<person-id>/...`. Files directly in `photos/inbox/` count as Zach's. Each photo gets `photographer: <person-id>`; an unknown folder name is an error listing valid ids.
- Photos from different people are grouped into the same country Visit when their dates and places line up (they traveled together). Visit `photographers` = everyone with photos in it.
- `companions` = photographers ∪ anyone listed in a matching visit override:
  ```toml
  [[visit_overrides]]
  country = "argentina"
  start = "2025-03-07"
  end = "2025-03-22"
  label = "Patagonia trip"
  companions = ["zach", "alex", "sam"]   # people on the trip, even if they took no photos
  ```
- `SpotVisit.people` = the visit's companions by default; a spot-level override can narrow it (e.g. only two of the group did the Fitz Roy hike):
  ```toml
  [[spot_people]]
  country = "argentina"
  spot = "el-chalten"
  visit = "argentina-2025-03"
  people = ["zach", "alex"]
  ```
- People with `hidden = true` are removed from every list; their photos are dropped. `show_photos = false` drops their photos but keeps them as companions.
- Tests: a visit with photos from two photographers gets both as companions; a spot override narrows people; hidden people never appear in any output file.

**One filter bar (the only filtering UI):**

> **Implemented as three filters** (supersedes the two-dropdown description below): **Photographer**
> (`by=`, photos that person took), **Traveler** (`who=`, photos that person is *tagged in* via
> `people = [...]` in `photos/inbox/captions.toml`) and **Trip** (`trip=`). They combine per photo;
> a trip stays listed while any of its photos pass. Changing Photographer or Traveler resets Trip.
Keep filtering simple: one bar at the top of the globe section, and nothing else on the page filters. Panels and the gallery only display.

- Two labeled dropdowns (native `<select>`, styled per `03-design-system.md`):
  - **Traveler:** Everyone (default) + each person in `people.json`. Choosing a person keeps only the trips that person was on (as photographer or companion). All photos from those trips stay visible, credited to whoever took them.
  - **Trip:** All trips (default) + one option per trip, labeled "March 2025 · Patagonia trip". Options are limited to trips that match the current Traveler, and listed newest first. At World level the list shows every trip; inside a country or spot it shows only trips to that place.
- Both filters apply to everything at once: country/spot/photo pins on the globe, counts, the side panel, the gallery, and lightbox prev/next.
- A live result line on the right ("11 photos · 2 trips", `aria-live="polite"`) and a "Clear filters" button that appears only when a filter is active.
- Changing Traveler resets Trip to "All trips". Filters persist while navigating between World, Country, and Spot.
- If a filter leaves a country or spot with no photos, its pin disappears; if the current spot becomes empty, go up one level.
- URL params: `who=<person-id>`, `trip=<visit-id>`.

**Who was there (display only):**
- In the spot and country panels, a "Trip" / "Trips here" section lists the matching trips as plain cards (not buttons): date range + photo count, optional label, and an avatar stack followed by names ("Zach, Alex & Sam").
- Under the spot name, a summary: "Argentina · Mar 12 – 18, 2025" for one trip, or "Argentina · 2 trips".
- People who were on a trip but sent no photos still appear in the avatar stack and names.

**Credits:**
- Photo pins use the photographer's color; a small legend on the map lists whose photos are showing ("Zach's photos", "Alex's photos").
- Gallery is grouped under trip headings ("March 2025 · Patagonia trip" + avatar stack). Each tile gets a small avatar badge and "by Alex" in its caption.
- Lightbox sidebar adds "Photo by Alex" and "With Zach & Sam".

**URL scheme additions:** `who=<person-id>`, `trip=<visit-id>`. Example: `/?c=argentina&s=el-chalten&who=alex&trip=argentina-2025-03`.

**Two-site option (later, optional):** the same codebase can build two variants from one flag: `SITE_MODE=portfolio` (whereszach domain: Zach's photos only, companions shown as tags) and `SITE_MODE=family` (wheresmyfam.com: everyone's photos, person filter on, optionally protected with Cloudflare Access so only invited emails can view). Build `portfolio` first.

**Done when:** a sample set with two photographers and a two-visit spot shows correct companions; the Traveler and Trip dropdowns filter pins, panels, gallery, and lightbox together; every filter state round-trips through the URL; and hidden people appear nowhere.

## Phase 5 — Contours, borders, visited tints

- Visited country fill + selected fill via feature-state.
- Soft border styling.
- maplibre-contour with thresholds and labels; optional hillshade behind a flag.

**Done when:** contours appear from zoom 3 with labels from zoom 6, borders read clearly but softly, and the map stays smooth (≥ 50 fps while panning on a recent laptop; usable on a mid-range phone).

## Phase 6 — Trips and live status

- `trips.ts` status logic with unit tests (time zones, delay, inclusive dates, multiple live trips).
- Trip markers, Upcoming trips list, Live banner, fly-to on click; client-only rendering.

**Done when:** tests cover the edge cases, and setting a test trip around today's date shows the live dot and banner while a future trip shows as upcoming.

## Phase 7 — Deploy

- Follow `07-deployment.md`: R2 bucket + custom domain + CORS, upload, hosting connected to GitHub, `PUBLIC_IMG_BASE`, headers, custom domain.

**Done when:** the live domain serves the site over HTTPS with images from `img.[DOMAIN]`, and a push to `main` redeploys.

## Phase 8 — Polish and launch

- Open Graph image (a favorite photo with the wordmark), meta tags, favicon, 404, `robots.txt`, sitemap.
- Lighthouse pass and fixes; accessibility pass (axe), screen reader smoke test.
- Optional: Cloudflare Web Analytics.

**Done when:** every item in the launch checklist (`07-deployment.md`) and the acceptance criteria (`01-product-spec.md`) is checked.

## Later ideas (not v1)

- Trips layer: group photos by date range into trips with a route line and a "play trip" mode.
- Favorites slideshow in the hero.
- "Wander" button that flies to a random photo.
- Edit trips from a phone via a Worker + KV endpoint.
