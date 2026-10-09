# TODO

## Next up

- [ ] **Phase 7 — Deploy** (`docs/07-deployment.md`): Cloudflare account, domain, R2 bucket + `img.` custom domain + CORS, `uv run pipeline upload`, Pages connected to GitHub with `PUBLIC_IMG_BASE`.
- [ ] **Phase 8 — Polish & launch**: Open Graph image, favicon, 404, sitemap, Lighthouse + accessibility pass.
- [ ] Replace the example trips in `data/trips.json` with real ones (or `[]`), then `uv run pipeline trips`.
- [ ] Fill in `photos/inbox/locations.toml` and `trip-dates.toml` for the Japan and Patagonia trips.

## Possible features

### Videos

Feasible within the current setup (pipeline → R2 → static site); roughly one phase of work.

- **Pipeline:** read the date and GPS with ffprobe; transcode to H.264 MP4 plus a WebP poster frame; strip all metadata (including the QuickTime location) and verify it's gone. Bundle FFmpeg via the `imageio-ffmpeg` Python package so no system install is needed.
- **Data:** `kind: "video"`, `duration`, `poster` on the existing photo entries. Spots, trips, filters, tags and the `gps` flag all work unchanged.
- **Site:** poster tiles with ▶ and duration, a video player in the lightbox, and a play mark on map pins. Videos load only when opened.
- **Location:** the X-T4 likely doesn't record GPS in video files, so use `locations.toml` or the nearest-photo fill. Phone videos usually carry GPS.
- **Size:** 1080p is ~40–60 MB/min (~400 30-second clips in R2's free 10 GB); 720p is ~20 MB/min. Beyond that, R2 is ~$0.015/GB-month, with no charge for viewers.
- **Keep clips short** (under ~2 min) so plain MP4 from R2 works. Long videos would need HLS or Cloudflare Stream.
- **Decide:** maximum quality (1080p recommended vs 4K), click-to-play with sound vs muted looping previews, and any clip length limit.

### Other ideas (from `docs/08-build-plan.md`)

- [ ] Trip route lines and a "play trip" mode.
- [ ] Favorites slideshow in the hero.
- [ ] "Wander" button that flies to a random photo.
- [ ] Edit trips from a phone (Worker + KV endpoint).
- [ ] Positioned photo tags (dots on the person in the photo) instead of a name list.
- [ ] Hillshade layer (built, behind `HILLSHADE` in `site/src/lib/map/contours.ts`; check phone performance first).
