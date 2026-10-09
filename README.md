# Where's Zach — build kit for Claude Code

This folder is everything Claude Code needs to build the travel photography site we designed (the "Alpine Morning" globe). Drop the whole folder into an empty project directory and start Claude Code there.

## What's in here

| File | Purpose |
|---|---|
| `CLAUDE.md` | Standing instructions Claude Code reads automatically: stack, rules, commands, conventions. |
| `docs/01-product-spec.md` | What the site does: every screen, state, and interaction, with acceptance criteria. |
| `docs/02-architecture.md` | Stack, repo layout, data flow, URL scheme. |
| `docs/03-design-system.md` | Alpine Morning tokens: colors, type, spacing, components, motion. |
| `docs/04-photo-pipeline.md` | The Python script that turns your exported photos into thumbnails, JSON, and R2 uploads. |
| `docs/05-map-and-globe.md` | MapLibre globe, zoom levels, pins, clustering, contours, borders, fly-to choreography. |
| `docs/06-trips-and-live-status.md` | Future trips and the "here now" pulsing dot, including the privacy offset. |
| `docs/07-deployment.md` | Cloudflare (static hosting + R2 + domain), costs, caching. |
| `docs/08-build-plan.md` | Phased task list with a definition of done for each phase. |
| `data/*.example.json` | Example data files showing the exact schemas. |
| `config/pipeline.example.toml` | Example pipeline config (photo folder, privacy zones, R2 bucket). |
| `reference/mockup-alpine.html` | The interactive mockup's source. Visual and behavioral reference only — not production code. |
| `reference/mockup-people-and-trips.html` | Mockup of the spot panel with "Who was there", "Trips here", the person filter, and photographer credits. |

## How to use it

1. Create an empty folder, e.g. `~/code/whereszach`, and copy this kit into it.
2. Open a terminal there and run `claude`.
3. Start with:

   > Read CLAUDE.md and everything in /docs. Then follow docs/08-build-plan.md starting at Phase 0. Stop at the end of each phase, show me what you built and how to run it, and wait for me before continuing.

4. Before Phase 1, put 20–50 of your exported photos (JPEG or HEIC with GPS data) in `photos/inbox/` so the pipeline has real data to test with.
5. Before Phase 7, create a free Cloudflare account and decide on a domain.

## Things only you can decide (marked `[DECIDE]` in the docs)

- Final site name and domain.
- Home or other private locations to exclude from the map (`config/pipeline.toml`).
- Which trips to list and how precise the live location should be.
- Captions and which photos are "favorites" (cover images).
- Who goes in `data/people.json` (only people who've agreed), and who was on each trip.
