# 06 — Trips and live status

Zach lists planned trips in `data/trips.json`. The site decides in the visitor's browser whether each trip is upcoming, live, or over. No server, no tracking.

## Schema

```ts
type Trip = {
  id: string;                    // "lofoten-2026"
  name: string;                  // "Lofoten, Norway" (shown to visitors)
  lat: number; lon: number;      // the point to show, already privacy-adjusted (see below)
  start: string;                 // "2026-10-05" inclusive, local date at the destination
  end: string;                   // "2026-10-16" inclusive
  tz: string;                    // IANA time zone of the destination, e.g. "Europe/Oslo"
  precision?: "region" | "city"; // default "region"
  live_delay_days?: number;      // default 1: go live this many days after start
  hide_end_date?: boolean;       // default false
  show_upcoming?: boolean;       // default true; false = only appears once live
};
```

## Status logic (`site/src/lib/trips.ts`, pure function, unit tested)

```
today_at_destination = current date in trip.tz (use Intl.DateTimeFormat with timeZone)
live_from = start + live_delay_days
if today_at_destination > end            → "past"     (not shown)
if live_from <= today_at_destination     → "live"
if show_upcoming and today < start       → "upcoming"
otherwise                                → hidden
```

Re-evaluate on load and every 10 minutes while the tab is open. Prerendered HTML must not bake in a status (the build date would go stale); render trip UI client-side only, after hydration.

If more than one trip is live, show the one that started most recently.

## What visitors see

- **Upcoming:** blue hollow ring with dashed outer ring on the globe, label "JAN 12 · QUEENSTOWN"; row in the side panel's "Upcoming trips" list with the date range and a countdown ("in 95 days", "tomorrow").
- **Live:** green dot with white border and two expanding pulse rings, label "HERE NOW · LOFOTEN"; hero banner "Currently in Lofoten, Norway · through Oct 16 — Show on globe →" (omit "through …" if `hide_end_date`).
- Clicking either flies to the location (see `05-map-and-globe.md`).
- After the trip ends, the marker disappears. Once its photos go through the pipeline, the place shows up as a visited country/spot like any other.

## Privacy

Showing "Zach is away right now" on a public, named site also tells people the home is empty, and an exact live location can be misused. Defaults are chosen to be safe:

- `precision: "region"` (default): enter the coordinates of the general region (e.g. the middle of the Lofoten islands), never a hotel, address, or small town. At this precision the site also rounds the coordinates to 1 decimal place (~10 km) before drawing them. `"city"` allows a city-center point rounded to 2 decimals (~1 km).
- `live_delay_days: 1` by default, so the live dot appears the day after arrival.
- Never accept GPS from a phone or any automatic live source. Trips are only what Zach typed in.
- `uv run pipeline trips` validates: dates parse, `end >= start`, `tz` is valid, coordinates are not inside any private zone, and warns if coordinates have more than 2 decimal places (≈1 km), since that's more precise than a region.

## Updating trips

Edit `data/trips.json`, run `uv run pipeline trips`, commit, push. The site redeploys in about a minute.

Optional later (not in v1): a password-protected Cloudflare Worker + KV endpoint so trips can be edited from a phone without git.
