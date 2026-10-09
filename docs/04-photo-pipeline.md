# 04 — Photo pipeline

A local Python CLI that turns a folder of exported photos into web images and the JSON the site reads. Run it whenever new photos are added. Idempotent and incremental.

## CLI

```
uv run pipeline ingest   [--config config/pipeline.toml] [--force]
uv run pipeline upload   [--dry-run]
uv run pipeline trips    # validate data/trips.json
uv run pipeline report   # summary: photos, skipped (no GPS / private zone), countries, spots
```

Use `typer` for the CLI and `rich` for progress output.

## Config (`config/pipeline.toml`, gitignored; example in `config/pipeline.example.toml`)

```toml
inbox = "photos/inbox"
out = "photos/out"
data = "data"
sizes = [480, 1600, 2560]
webp_quality = 82
coord_decimals = 4              # ~11 m; set 3 for ~110 m
include_unmapped = false

[[private_zones]]               # [DECIDE] home, family, etc. Photos inside are dropped from the map.
name = "home"
lat = 0.0
lon = 0.0
radius_km = 2.0

[spots]
eps_km = 8.0                    # DBSCAN radius for grouping photos into spots
min_samples = 1

visit_gap_days = 4              # a gap longer than this between photo dates starts a new visit
# [[visit_overrides]]           # optional, see 08-build-plan.md Phase 4.5
# country = "argentina"
# start = "2025-03-07"
# end = "2025-03-22"
# label = "Patagonia trip"

[overrides]                     # optional: rename or merge spots by id
# "el-calafate" = { merge_into = "el-chalten" }
# "bariloche"   = { name = "Bariloche & Lakes" }

[r2]
bucket = "whereszach-photos"
public_base_url = "https://img.[DOMAIN]"
# credentials come from .env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
```

Optional sidecar `photos/inbox/captions.toml`:

```toml
["DSC04512.jpg"]
caption = "First light on Fitz Roy from Laguna de los Tres."
favorite = true
people = ["alex", "sam"]   # optional: people in the photo (ids from data/people.json; hidden people are dropped)
```

Optional sidecar `photos/inbox/locations.toml` for photos without GPS (e.g. camera lost its phone Bluetooth link), keyed by local date or filename:

```toml
2025-04-17 = { lat = 34.9671, lon = 135.7727 }
"DSCF2100.JPG" = { lat = 34.6873, lon = 135.5262 }
```

Location priority: camera GPS > filename entry > nearest-in-time GPS photo by the same photographer within `gps_fill_hours` (config, default 3) > date entry. Filled locations still go through the private-zone filter. Folders below `photos/inbox/<person-id>/` (e.g. one per trip) are allowed and ignored.

## Steps in `ingest`

1. **Scan** `inbox` (and its per-person subfolders, see `08-build-plan.md` Phase 4.6) for `.jpg .jpeg .png .heic .heif .tif`. Register `pillow-heif` so HEIC opens.
2. **Hash** each file (SHA-256 of bytes, first 10 hex chars = `id` suffix). Skip unchanged files using `photos/out/manifest.json` unless `--force`.
3. **Read metadata** from EXIF: GPS lat/lon (convert DMS + ref to signed decimal), altitude, DateTimeOriginal + OffsetTimeOriginal, Make, Model, LensModel, FocalLength, FNumber, ExposureTime, ISO, orientation. Photo `id` = `YYYY-MM-DD-<hash10>`.
4. **Filter:**
   - No GPS → skip (or keep as unmapped if configured).
   - Inside any private zone (haversine distance < radius) → skip entirely and log it.
   - Round coordinates to `coord_decimals`.
5. **Reverse geocode** with `reverse_geocoder` (offline GeoNames): nearest place name, admin1, ISO country code. Map ISO code → country name and slug via `pycountry` (slug: lowercase, ASCII, hyphens; `costa-rica`).
6. **Spots:** per country, run DBSCAN (haversine metric, `eps_km`) on photo coordinates. Each cluster becomes a spot:
   - `name`: the most common reverse-geocoded place name among its photos (overridable).
   - `id`: slug of the name, unique within the country.
   - `center`: mean lat/lon; `radius_km`: 90th percentile distance from center (min 0.5 km).
   - `zoom`: camera zoom that fits the radius (see `05-map-and-globe.md`).
7. **Derivatives:** apply EXIF orientation, convert to sRGB, resize to each width in `sizes` (never upscale), save WebP, **strip all metadata**. Name `p/<hash10>-<width>.webp`. Record pixel width/height and the dominant color (resize to 1×1, hex).
8. **Countries:** aggregate per country: center (bounding-box center of its spots), `zoom` to fit all spots, counts, `cover` = up to 3 photo ids (favorites first, then most recent), `last_visit` date.
9. **Visited polygons:** from Natural Earth 1:50m Admin 0 countries, keep only visited countries (match on `ISO_A2_EH`, not `ISO_A2`, which is `-99` for some countries), simplify (tolerance ~0.03°), write `data/visited-countries.geojson`. Cache the Natural Earth download in `pipeline/.cache/`.
10. **Write** `data/photos.json`, `spots.json`, `countries.json` (sorted, pretty-printed, stable ordering so git diffs are readable) and update the manifest.

## `upload`

Sync `photos/out/p/` to R2 with `boto3` (S3 API, endpoint `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`, region `auto`). Upload only objects missing in the bucket (list once, diff). Set `Content-Type: image/webp` and `Cache-Control: public, max-age=31536000, immutable`. Never delete remote objects unless `--prune` is passed.

## Schemas

```ts
// photos.json
type Photo = {
  id: string;                 // "2026-03-14-a1b2c3d4e5"
  hash: string;               // "a1b2c3d4e5"
  country: string;            // country slug, e.g. "argentina"
  spot: string;               // spot id within country, e.g. "el-chalten"
  lat: number; lon: number;   // rounded
  alt_m?: number;
  taken: string;              // ISO 8601 with offset when available
  w: number; h: number;       // pixel size of the largest derivative
  color: string;              // "#7a8c95" placeholder color
  camera?: { make?: string; model?: string; lens?: string;
             focal_mm?: number; f?: number; shutter?: string; iso?: number };
  caption?: string;
  favorite?: boolean;
  photographer: string;       // person id (Phase 4.6)
  visit: string;              // Visit.id (Phase 4.5)
};

// spots.json
// Visit, SpotVisit and Person: see 08-build-plan.md, Phases 4.5 and 4.6

type Spot = { id: string; country: string; name: string; lat: number; lon: number;
              radius_km: number; zoom: number; count: number; photos: string[]; visits: SpotVisit[] };

// countries.json
type Country = { id: string; iso2: string; name: string; lat: number; lon: number;
                 zoom: number; count: number; spots: string[]; cover: string[]; last_visit: string;
                 visits: Visit[] };   // newest first
```

Image URL for a photo: `${PUBLIC_IMG_BASE}/p/${hash}-${width}.webp`.

## Tests (pytest)

- DMS → decimal conversion incl. S/W refs.
- Private-zone filter drops a photo 1 km from a zone center and keeps one 3 km away.
- Coordinate rounding.
- DBSCAN grouping: Buenos Aires and El Chaltén photos become two spots in one country.
- Visit derivation: photos 10 days apart in one country become two visits; overrides replace overlapping derived visits.
- Output JSON validates against the schemas (pydantic models).
- Derivatives contain no EXIF (re-open with Pillow, `getexif()` is empty).
