# 05 — Map and globe

Built with MapLibre GL JS v5 using the globe projection. Check the current MapLibre and maplibre-contour docs for exact option names before coding; the intent below is what matters.

## Map setup

- `projection: { type: 'globe' }`, transparent canvas background so the stage gradient, sun, and ridges show around the globe. Add a light atmosphere/sky that blends into `--stage-gradient`.
- Initial view: center `[-40, 18]`, zoom ~1.6 (globe fills ~75% of stage height), bearing 0, pitch 0.
- Disable rotate-by-right-drag and pitch for simplicity (`dragRotate: false`, `pitchWithRotate: false`, `touchPitch: false`). Keep drag-pan, scroll and pinch zoom, double-click zoom.
- Attribution control bottom-right, compact.
- Max zoom 17. Min zoom 1.2.
- Pass `padding` on camera moves on desktop so targets center in the visible stage, not under overlays.

## Base style ("Alpine Morning")

Start from the OpenFreeMap Positron or Liberty style JSON (OpenMapTiles schema), then restyle in `style.ts`:

| Layer | Style |
|---|---|
| background (land) | `#EEF2EC` |
| water fill | `#B9D2D7`; `water` outline as coast: `--coast`, 1px |
| landcover wood / grass | `#DCE6D6` / `#E3EBDF`, opacity 0.8 |
| landcover ice / glacier | `#F6F9F9` |
| park | `#D6E4D1` |
| buildings (z ≥ 14) | `#E2E6E0` fill, `#D3D9D2` outline |
| roads | white lines with `#D5DDD7` casing; minor roads appear from z 12 |
| paths / trails | dashed `#9C7B52` 1px from z 12 (important for hiking spots) |
| place labels | basemap Noto Sans from OpenFreeMap glyphs, `--muted` text with white halo; hide labels below z 3 |
| country borders | `boundary` source-layer, `admin_level == 2`, `maritime == 0`: halo line `--border-halo` width 4 (2.5 below z 3), then dash-dot line `--border-line` width 1.4 (0.9 below z 3), dasharray `[4, 2, 1, 2]` |

Drop layers we don't need (POIs, transit, housenumbers) to keep the map calm.

## Visited countries tint

GeoJSON source from `data/visited-countries.geojson`. Fill layer under borders: `--visited-fill`; when a country is selected, its feature uses `--selected-fill` (use `feature-state` keyed by country slug).

## Elevation contours

Use `maplibre-contour` with a free Terrarium-encoded DEM (AWS Open Data Terrain Tiles: `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`, maxzoom 13 for the DEM source, `worker: true`).

- Thresholds in meters (minor, major) by zoom: `4: [500, 2000]`, `6: [250, 1000]`, `8: [200, 1000]`, `10: [100, 500]`, `12: [50, 250]`, `14: [20, 100]`.
- Line layers: minor `--contour` 0.9px, major `--contour-index` 1.4px. Visible from zoom 3.
- Labels on major lines: symbol layer along line, text `"{ele} m"`, 10px, `--contour-label` with halo `rgba(214, 228, 230, 0.9)`, from zoom 6.
- Optional subtle hillshade from the same DEM (raster-dem + hillshade layer, exaggeration 0.25, shadow `#9FB3AC`, highlight `#FFFFFF`) between land and contours. Ship it only if it stays calm and fast on a phone.
- Contours are progressive enhancement: if the DEM fails, the site still works.

## Markers and zoom levels

Use **HTML markers** (`maplibregl.Marker` with a `<button>` element) for country pins, spot pins, photo pins, and trip markers. There are at most a few hundred visible at once, and HTML markers can be styled with the design tokens, focused by keyboard, and announced by screen readers. Hide markers on the far side of the globe (use MapLibre v5's built-in marker occlusion if available; otherwise compute visibility from the camera and set `visibility`).

| Level | Markers shown | Notes |
|---|---|---|
| World | One **country pin** per visited country: 11px `--sunrise` dot with a pulsing soft ring, label chip "ICELAND 22" (mono, uppercase). Countries flagged `label_left` place the chip on the left to avoid overlaps. | Plus trip markers |
| Country | **Spot pins** for the selected country: 38px circle, 2px `--pine` ring, `--surface` fill, count in mono `--pine`; name chip underneath. Selected spot: `--pine` fill, white count. | Country pins hidden |
| Spot | **Photo pins** for the selected spot: teardrop (head 13px radius, tip at the coordinate), `--pin-photo`, white inner circle with the photo's number in the spot; hover `--pin-photo-hover` + label "PHOTO 3 · 49.29°S 73.01°W"; open photo `--pin-photo-open`. Dashed `--pine` ring of radius `radius_km × 1.25` around the spot center with label "EL CHALTÉN · 7 PHOTOS". | Spot circles fade out |

Photo pins at nearly identical coordinates: cluster with `supercluster` (radius 40px) inside the selected spot; a cluster shows as a teardrop with the count, and clicking it zooms in until they separate (or opens a mini list if they never do, e.g. same tripod spot).

Pin drop-in: when Spot level is reached, add photo pins one by one (90ms stagger, 420ms ease-out fall from 60px above). Reduced motion: no animation.

## Camera choreography (`camera.ts`)

Compute target zooms from data: `country.zoom` and `spot.zoom` from the pipeline (fit all spots / fit spot radius with ~25% margin, using the stage size). Clamp country zoom to [3, 9] and spot zoom to [11, 16].

| Transition | Behavior |
|---|---|
| World idle | Auto-rotate: shift center longitude ~5°/s with `jumpTo` in a rAF loop. Pause on any user interaction; resume after 4 s idle at World level. |
| World → Country | Phase 1 (~1.2 s): rotate one full extra turn while easing zoom out ~0.4. Phase 2 (~1.4 s): `flyTo` the country center and zoom. Feels like the globe spins around, then dives in. |
| Country → Spot | `flyTo` with low `curve` (≈1.2) so it pans first and zooms last, ~1.9 s. On `moveend`, run pin drop-in. |
| Spot → Spot (same country) | `flyTo` with high `curve` (≈1.8) so it zooms out to roughly country level mid-flight, ~1.9 s. |
| Anything → World | Zoom out first (`easeTo` zoom 1.6, 0.9 s), then resume auto-rotate. |
| Trip marker click | From any level: go to World level, `flyTo` the trip location at zoom ~2.5. |

Cancel any running animation when the user starts dragging. Always set state first; the camera follows state, not the other way round.

## Interaction mapping

- Marker clicks call state actions (`selectCountry`, `selectSpot`, `openPhoto`).
- Map background click at Spot level does nothing (avoid accidental exits).
- Keyboard: markers are buttons in DOM order (country, then spot, then photo order); Enter/Space activate. Esc closes the lightbox, then goes up one level.

## Performance

- Load MapLibre and the style lazily after first paint; show a static globe placeholder (light circle with the ridge backdrop) while loading.
- Remove unused style layers. Keep DEM tile size 512 with the contour worker.
- Throttle marker visibility recalculation to animation frames.
