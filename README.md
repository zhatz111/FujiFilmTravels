# Where's Everyone

A personal travel photography site built around a 3D globe. Spin it, fly into a country, and see a pin at the spot where each photo was taken. Open a spot to browse its photos in a gallery and lightbox. Upcoming trips show on the globe, and a pulsing "here now" dot appears while a trip is underway.

## How it works

```
photos/inbox ──► Python pipeline ──► photos/out (WebP, no EXIF) ──► Cloudflare R2
                        │
                        └──► data/*.json (committed) ──► SvelteKit static site ──► Cloudflare Workers
```

- **Pipeline** (`pipeline/`, Python + uv): reads your exported photos, makes resized WebP images with all metadata stripped, groups photos into spots and countries by GPS, and writes the JSON in `data/`. Photos inside a configured private zone (e.g. home) are never published.
- **Site** (`site/`, SvelteKit + Svelte 5): a fully prerendered static site. It reads `data/` at build time and loads images from R2. The globe is MapLibre GL with OpenFreeMap tiles and contour lines. The lightbox is PhotoSwipe.
- **Hosting:** Cloudflare Workers static assets for the site, which rebuilds on every push to `main`, and Cloudflare R2 for images.

## Getting started

Requirements: Node 22+, pnpm, Python 3.11+, and [uv](https://docs.astral.sh/uv/).

```sh
pnpm --dir site install
uv sync
cp config/pipeline.example.toml config/pipeline.toml   # set private zones, R2 bucket
cp .env.example .env                                   # R2 credentials (only needed to upload)
```

Put photos in `photos/inbox/<person>/<trip-folder>/`, then:

```sh
uv run pipeline ingest   # build images + data/*.json
pnpm dev                 # view the site locally
```

The site also runs with empty data, so you can work on it before adding any photos.

## Publishing new photos

```sh
uv run pipeline ingest
uv run pipeline upload               # images to R2 first...
git add data && git commit -m "Add <trip> photos" && git push   # ...then the data
```

Upload before you push, so the live site never points at images that aren't on R2 yet. The site redeploys on its own after the push.

[COMMANDS.md](COMMANDS.md) covers every command and the hand-edited files: locations for photos without GPS, trip dates, captions, people, and planned trips.

## Repo layout

| Path | What's there |
|---|---|
| `site/` | SvelteKit app. `site/wrangler.jsonc` configures the Cloudflare deploy. |
| `pipeline/` | Python photo pipeline and its tests. |
| `data/` | Generated `photos.json`, `spots.json`, `countries.json`, plus hand-edited `people.json` and `trips.json`. This is the contract between the pipeline and the site. |
| `config/` | `pipeline.example.toml`. Your real `pipeline.toml` is gitignored. |
| `photos/` | Source photos and generated images. Gitignored. |
| `docs/` | Design specs: product, architecture, design system, pipeline, map, trips, deployment, build plan. |
| `reference/` | The original HTML mockups. Visual reference only. |

## Deployment

Cloudflare Workers build settings:

| Setting | Value |
|---|---|
| Root directory | `site` |
| Build command | `pnpm install --frozen-lockfile && pnpm build` |
| Deploy command | `npx wrangler deploy` |
| Build variable | `PUBLIC_IMG_BASE` = the R2 public URL (currently the `r2.dev` URL; `https://img.<domain>` later) |

`PUBLIC_IMG_BASE` is applied at build time, so you have to redeploy after changing it. For R2 bucket setup, CORS, and caching, see [docs/07-deployment.md](docs/07-deployment.md).

## Privacy

- Served images are re-encoded WebP with no EXIF. Originals never leave your machine.
- Photos inside private zones in `config/pipeline.toml` are dropped before anything is written.
- `.env`, `config/pipeline.toml`, and `photos/` are never committed.
- People appear only if they're listed in `data/people.json`.

## Development

```sh
pnpm check                # svelte-check + TypeScript
pnpm lint                 # Prettier + ESLint
pnpm test                 # site unit tests (Vitest)
uv run pytest pipeline    # pipeline tests
```

What's next is tracked in [TODO.md](TODO.md).
