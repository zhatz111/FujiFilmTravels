# 07 — Deployment (Cloudflare, free tier)

Cloudflare's dashboards and recommendations change; check the current Cloudflare docs when doing these steps. Cloudflare Pages and Workers with static assets can both host a fully static SvelteKit build for free. Use whichever the current docs recommend for new static sites and keep the setup equivalent to what's described here.

## One-time setup

1. **Domain** `[DECIDE]`: register it through Cloudflare Registrar (at-cost pricing) or point an existing domain's nameservers to Cloudflare. The R2 custom domain below requires the domain to be on Cloudflare DNS.
2. **R2 bucket** `whereszach-photos`:
   - Connect a custom domain `img.[DOMAIN]` for public read access. Do not use the rate-limited `r2.dev` URL in production.
   - CORS policy: allow `GET`, `HEAD` from `https://[DOMAIN]` and `http://localhost:5173`.
   - Create an R2 API token with Object Read & Write on this bucket only. Put it in `.env`:
     ```
     R2_ACCOUNT_ID=...
     R2_ACCESS_KEY_ID=...
     R2_SECRET_ACCESS_KEY=...
     ```
3. **Site hosting:** connect the GitHub repo (private is fine).
   - Root directory: `site`
   - Build command: `pnpm install --frozen-lockfile && pnpm build`
   - Output directory: `build`
   - Environment variable: `PUBLIC_IMG_BASE=https://img.[DOMAIN]`
   - Custom domain: `[DOMAIN]` and `www.[DOMAIN]` (redirect www → apex).
4. **Caching headers** (`site/static/_headers` or the equivalent for the chosen host):
   ```
   /_app/immutable/*
     Cache-Control: public, max-age=31536000, immutable
   /*.json
     Cache-Control: public, max-age=300
   ```
   R2 objects get `Cache-Control: public, max-age=31536000, immutable` at upload time (content-hashed names make this safe).

## Day-to-day workflow

```
# add new photos to photos/inbox, then:
uv run pipeline ingest
uv run pipeline upload
git add data && git commit -m "Add Patagonia photos" && git push   # site redeploys automatically
```

Upload must run before push, so the new JSON never points at images that don't exist yet.

## Free tier fit

- R2 free tier: 10 GB storage, 1M Class A (writes) and 10M Class B (reads) operations per month, no egress fees. Edge caching on the custom domain means most image views never hit R2. At roughly 350 KB per photo across three WebP sizes, 10 GB holds 25,000+ photos.
- Static hosting: free tier covers a personal site comfortably; images aren't stored with the site, so file-count limits don't matter.
- OpenFreeMap tiles and the public DEM tiles: free, no keys. Add attribution.
- Only real cost: the domain (~$10–$15/year depending on extension).

## Launch checklist

- [ ] `pnpm check`, `pnpm lint`, tests green.
- [ ] Lighthouse mobile targets from `01-product-spec.md` met on the deployed URL.
- [ ] Spot-check 5 served images: no EXIF (`exiftool` shows nothing beyond file basics).
- [ ] Private zones: confirm no pins near home.
- [ ] Open Graph image, title, and description render in a link preview.
- [ ] 404 page and `robots.txt` present.
- [ ] Optional: Cloudflare Web Analytics (free, cookieless) script added.
