# CLAUDE.md — Where's Zach

A personal travel photography site. Visitors spin a 3D globe, fly into countries and spots where Zach took photos, see Google-Maps-style pins at each photo's GPS location, and browse the photos in a gallery and lightbox. Planned trips show on the globe, with a pulsing "here now" dot during a trip.

Read every file in `/docs` before writing code. `docs/08-build-plan.md` is the order of work. The interactive mockup in `reference/mockup-alpine.html` is the visual and behavioral target; match its look and feel, but do not copy its code (it runs on a proprietary canvas runtime and hand-draws the globe; production uses MapLibre).

## Stack (do not swap without asking)

- **Site:** SvelteKit (Svelte 5) + TypeScript, `@sveltejs/adapter-static`, fully prerendered. No server code in production.
- **Map:** MapLibre GL JS v6 with globe projection (docs say v5; v6 is current — its worker is wired up in `Globe.svelte` + `vite.config.ts`). Vector tiles from OpenFreeMap. Contours from `maplibre-contour` using free public DEM tiles.
- **Lightbox:** PhotoSwipe v5.
- **Styling:** plain CSS with custom properties from `src/lib/styles/tokens.css` (values in `docs/03-design-system.md`). No Tailwind, no CSS-in-JS, no UI kit.
- **Photo pipeline:** Python 3.11+, managed with `uv`. Pillow, pillow-heif, reverse_geocoder, pycountry, scikit-learn, boto3.
- **Hosting:** Cloudflare static hosting (Pages or Workers static assets) + Cloudflare R2 for images.
- **Package manager:** pnpm.

## Repo layout

```
/site            SvelteKit app
/pipeline        Python photo pipeline (uv project)
/config          pipeline.toml (gitignored) + pipeline.example.toml
/photos/inbox    source photos (gitignored); one subfolder per person id, loose files = Zach
/photos/out      generated derivatives (gitignored)
/data            JSON (committed): generated photos.json, spots.json, countries.json; hand-edited people.json, trips.json
/docs            specs (this kit)
/reference       mockup (reference only)
```

`/data` is the contract between the pipeline and the site. The site imports from `/data` at build time; it never calls the pipeline.

## Commands (create these in Phase 0)

- `pnpm dev` — run the site locally.
- `pnpm build` / `pnpm preview` — production build and preview.
- `pnpm check` — svelte-check + TypeScript.
- `pnpm lint` — ESLint + Prettier check.
- `uv run pipeline ingest` — process `photos/inbox` → `photos/out` + `/data`.
- `uv run pipeline upload` — sync `photos/out` to R2.
- `uv run pipeline trips` — validate `data/trips.json`.

## Rules

- Privacy first. Never publish original files or any EXIF in served images. Never put a photo inside a configured private zone on the map. Never commit `config/pipeline.toml`, `.env`, or anything under `photos/`.
- No secrets in the repo or the client bundle. R2 credentials live in `.env` and are used only by the pipeline.
- The site must work with zero JavaScript errors when `/data/*.json` is empty (fresh repo state).
- Respect `prefers-reduced-motion`: no auto-spin, instant camera moves, no pulse animation.
- Accessibility: every map action has a non-map equivalent (destination list, spot list, gallery). Real `<button>`/`<a>` elements, visible focus, 4.5:1 text contrast.
- Performance budget: first load JS ≤ 350 KB gzipped excluding MapLibre; LCP < 2.5 s on fast 4G; thumbnails lazy-loaded.
- Keep components small and typed. Data types live in `site/src/lib/types.ts` and mirror the schemas in `docs/04-photo-pipeline.md`.
- Write tests for pure logic (trip status, URL state, clustering helpers, pipeline privacy filters). Vitest for the site, pytest for the pipeline.
- When a doc is ambiguous, ask instead of guessing. Items marked `[DECIDE]` need Zach.
- Stop at the end of each build-plan phase and summarize what changed and how to verify it.
