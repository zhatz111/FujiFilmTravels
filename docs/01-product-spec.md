# 01 — Product spec

## Purpose

A personal portfolio for Zach's nature and travel photography, organized by where each photo was taken. It should be fun to spin around when showing someone in person, and fast and readable on a phone.

Working name: **Where's Zach** `[DECIDE final name + domain]`.

## Page structure (single page, top to bottom)

1. **Header** — wordmark (left), nav: Globe, Gallery, About, Instagram link (right).
2. **Hero** — headline "Places I've pointed a camera at.", one-line intro, stats (countries, spots, photos), and the live-trip banner when a trip is active.
3. **Globe section** — globe stage (left, ~70%) + side panel (right, ~30%). On narrow screens the panel stacks below the globe.
4. **Gallery section** — content depends on the current selection.
5. **Footer** — credit line, "locations come from each photo's GPS data", Instagram.
6. **Lightbox** — full-screen photo viewer, opened from the gallery or from a photo pin.

## Navigation levels

The whole experience is one state machine with four levels. Every level has a shareable URL (see `02-architecture.md`).

| Level | Globe shows | Side panel shows | Gallery shows |
|---|---|---|---|
| **World** | Slowly auto-spinning globe. One pin per visited country with its photo count and visit year. Visited countries lightly tinted. Trip markers. | Destination list (country, coordinates, photo count) + Upcoming trips list | Country cards (3-image collage cover, name, "N spots · N photos"), most recent trip first |
| **Country** | Globe spins to and zooms into the country. Country pins disappear; spot pins appear (circle with count + name label). Contours with elevation labels, borders. | Back to all destinations, country name, coords, photo count, list of spots | Filter chips (All + each spot) + masonry grid of that country's photos |
| **Spot** | One more zoom to street level. Spot circle fades; one teardrop pin per photo at its GPS location, dropping in one by one. Dashed ring around the spot's area. | Same as Country, with the spot highlighted | Same grid filtered to the spot, matching chip active |
| **Photo** (overlay) | Unchanged underneath; the photo's pin is highlighted | — | Lightbox open over the page |

### Transitions (match the mockup's feel)

- **World → Country:** one full extra rotation while pulling back slightly, then dive in. ~2.4 s.
- **Country → Spot:** camera centers on the spot first, then zooms. ~1.9 s.
- **Spot → another Spot (same country):** zoom out to country level, pan, zoom back in. ~1.9 s.
- **Spot/Country → World:** zoom out first, then pan, then resume auto-spin.
- Reduced motion: all transitions are instant jumps, no auto-spin.

## Interactions

- Drag to rotate the globe; scroll/pinch to zoom; double-click zooms in.
- Hovering a pin shows a pointer cursor; hovering a photo pin shows a label "PHOTO n · coordinates".
- Clicking a country pin or destination row → Country level.
- Clicking a spot pin, spot row, or chip → Spot level.
- Clicking a photo pin or gallery tile → Lightbox for that photo.
- Breadcrumb (top-left of globe): World / Country / Spot; each crumb navigates up.
- Hint pill (bottom-center of globe) changes per level: "Drag to spin · click a pin to fly in", "Click a spot to zoom in", "Click a pin to open that photo".
- Legend (bottom-left of globe): Here now (green), Upcoming trip (blue ring), Visited (orange).
- Browser back/forward moves between levels (URL-driven state).

## Visit dates, people, and trips

- Every country and spot shows when it was visited, derived from photo dates (`08-build-plan.md`, Phase 4.5).
- Photos are credited to whoever took them; each trip records who was on it, shown in the spot and country panels.
- One filter bar at the top of the globe section with two dropdowns, Traveler and Trip, filters everything (pins, panels, gallery, lightbox). Nothing else on the page filters (`08-build-plan.md`, Phase 4.6).

## Lightbox

- Large photo (display size, upgrades to full size on zoom), previous/next buttons, close button, keyboard (←/→/Esc), swipe on touch.
- Sidebar: position ("3 / 12"), spot name, country, coordinates, date taken, camera settings (focal length, aperture, shutter, ISO), camera/lens model, optional caption.
- Prev/next stays within the current filter (country or spot).

## Trips

- Upcoming trips appear as blue hollow rings with a dashed outer ring and a label "JAN 12 · QUEENSTOWN".
- During a trip, the location shows a green dot with expanding pulse rings and "HERE NOW · NAME", and the hero shows "Currently in X · through DATE — Show on globe".
- Clicking either flies the globe to the trip location.
- Full rules: `06-trips-and-live-status.md`.

## Empty and edge states

- No photos yet: globe still renders and spins; panel says "Photos coming soon"; gallery hidden.
- A country with one spot: Country level still shows; spot list has one row.
- A photo without GPS: excluded from the map, still listed in an "Unmapped" bucket only if `include_unmapped = true` in config (default false).
- Many photos at nearly the same coordinates: photo pins cluster below a zoom threshold and expand on click.

## Acceptance criteria (the site is "done" when)

- [ ] Every flow in the table above works with real pipeline output, by mouse, keyboard, and touch.
- [ ] URLs deep-link to any level and to an open photo; back/forward works.
- [ ] Contours, soft borders, and visited tints render at the right zoom levels.
- [ ] Trip markers and live banner appear and disappear on the correct dates.
- [ ] Lighthouse mobile: Performance ≥ 85, Accessibility ≥ 95, Best Practices ≥ 95, SEO ≥ 95.
- [ ] Served images contain no EXIF; no photo appears inside a private zone.
- [ ] Deploys to Cloudflare from `main` with images on R2 and the custom domain on HTTPS.
