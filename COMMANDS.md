# Commands cheat sheet

Run everything from the repo root.

## Adding photos

| Command | What it does |
|---|---|
| `uv run pipeline ingest` | Reads `photos/inbox/`, makes the web-sized WebP images in `photos/out/p/`, and rewrites `data/photos.json`, `spots.json`, `countries.json`, `visited-countries.geojson`. Only new or changed photos are processed. Prints a summary at the end. |
| `uv run pipeline ingest --force` | Same, but reprocesses every photo from scratch (use after changing `sizes` or `webp_quality`). |
| `uv run pipeline geotag --dry-run` | Lists the photos whose hand-entered location (`locations.toml`) would be written into the original JPEG's EXIF. Changes nothing. |
| `uv run pipeline geotag` | Writes those locations into the original JPEGs, losslessly (image data untouched, verified before saving), marked as hand-entered. Run `ingest` afterwards. |
| `uv run pipeline report` | Reprints the summary from the last ingest: what got published, what was skipped and why, countries and spots. |
| `uv run pipeline trips` | Checks `data/trips.json` (future/live trips) for bad dates, time zones, or locations inside a private zone. |
| `uv run pipeline upload --dry-run` | Shows which images would be uploaded to Cloudflare R2, without uploading. |
| `uv run pipeline upload` | Uploads new images to R2. Run before pushing so the site never points at missing images. |
| `uv run pipeline upload --prune` | Also deletes images in R2 that are no longer published. |

### Files you edit

| File | What goes in it |
|---|---|
| `photos/inbox/<person>/<trip-folder>/` | Photos, one folder per person (`zach`) and one subfolder per trip. |
| `photos/inbox/locations.toml` | Coordinates for photos without GPS. Ingest appends commented-out lines for photos that still need one; uncomment and fill in. |
| `photos/inbox/trip-dates.toml` | Exact travel dates and a label per trip folder. Ingest adds a section for each new folder. |
| `photos/inbox/captions.toml` | Optional, per photo: `["DSCF2100.JPG"]` then `caption = "..."`, `favorite = true` (becomes a country cover photo), `people = ["alex", "sam"]` (tags who's in it; ids from `data/people.json`). |
| `config/pipeline.toml` | Private zones (home etc.), image sizes/quality, spot renames/merges. Never committed. |
| `data/people.json` | People who can appear on the site (photographers and travel companions). |
| `data/trips.json` | Planned trips: shown as upcoming on the globe, then "Here now" during the trip (see `docs/06-trips-and-live-status.md`). Run `uv run pipeline trips` after editing. |

## Website

| Command | What it does |
|---|---|
| `pnpm dev` | Runs the site locally. Open the URL it prints (e.g. `http://localhost:5174/`). Ctrl+C to stop. Edits reload live. |
| `pnpm build` | Builds the static site into `site/build/`. |
| `pnpm preview` | Serves the built site locally, to check the production build. |
| `pnpm check` | Type-checks the site. |
| `pnpm lint` | Checks formatting and lint rules. `pnpm --dir site format` fixes formatting. |
| `pnpm test` | Runs the site's unit tests. |
| `uv run pytest pipeline` | Runs the pipeline's tests. |

## Typical "new trip" workflow

1. Copy photos to `photos/inbox/zach/<trip-folder>/`.
2. `uv run pipeline ingest`
3. Fill in `photos/inbox/trip-dates.toml` and any `locations.toml` stubs, then `uv run pipeline ingest` again.
4. `pnpm dev` and look it over.
5. (Once deployed) `uv run pipeline upload`, then commit and push `data/`.
