<script lang="ts">
	import { imgUrl, photoById, photos, visitById } from '#lib/data.ts';
	import { longMonthYear, monthYear } from '#lib/dates.ts';
	import { coord, plural } from '#lib/format.ts';
	import { app } from '#lib/state.svelte.ts';
	import type { Country, Photo } from '#lib/types.ts';
	import Avatars from './Avatars.svelte';
	import PhotoTile from './PhotoTile.svelte';

	/** gallery split into trips, keeping app.gallery's order (newest trip first) */
	const groups = $derived.by(() => {
		const out: { visit: string; photos: Photo[] }[] = [];
		for (const p of app.gallery) {
			if (out.at(-1)?.visit !== p.visit) out.push({ visit: p.visit, photos: [] });
			out.at(-1)!.photos.push(p);
		}
		return out;
	});

	/** up to 3 cover photos that pass the filters (favorites first from the pipeline, then any) */
	const cover = (c: Country) => {
		const ok = (p: Photo | undefined): p is Photo => !!p && app.ok(p.visit);
		const picks = c.cover.map((id) => photoById.get(id)).filter(ok);
		for (const p of app.shown) {
			if (picks.length >= 3) break;
			if (p.country === c.id && !picks.includes(p)) picks.push(p);
		}
		return picks;
	};
</script>

{#if photos.length > 0}
	<section id="gallery" aria-label="Gallery">
		{#if !app.country}
			<div class="bar">
				<h2>Countries</h2>
				<span class="mono note up">Sorted by most recent trip</span>
			</div>
			{#if app.countries.length === 0}
				<p class="note">No photos match these filters.</p>
			{/if}
			<div class="cards">
				{#each app.countries as c (c.id)}
					{@const pics = cover(c)}
					{@const last = app.visitsOf(c)[0]}
					<button class="card press" onclick={() => app.selectCountry(c.id)}>
						<span class="collage">
							{#each [0, 1, 2] as i (i)}
								{@const p = pics[i] ?? pics[0]}
								{#if p}
									<img
										src={imgUrl(p, 480)}
										alt=""
										loading="lazy"
										decoding="async"
										style:background={p.color}
									/>
								{/if}
							{/each}
						</span>
						<span class="card-text">
							<span class="name">{c.name}</span>
							<span class="mono note">
								{last ? `${monthYear(last.start)} · ` : ''}{plural(app.spotsIn(c).length, 'spot')} · {plural(
									app.countOf(c),
									'photo'
								)}
							</span>
						</span>
					</button>
				{/each}
			</div>
		{:else}
			{@const c = app.country}
			<div class="bar">
				<div class="title">
					<h2 class="big">{app.spot?.name ?? c.name}</h2>
					<span class="mono note">
						{app.spot ? coord(app.spot.lat, app.spot.lon) : coord(c.lat, c.lon)}
					</span>
				</div>
				<span class="mono note up">{plural(app.gallery.length, 'photo')}</span>
			</div>
			<div class="chips" role="group" aria-label="Choose a spot">
				<button class="pill chip" aria-pressed={!app.spot} onclick={() => app.selectCountry(c.id)}>
					All<span class="mono">{app.countOf(c)}</span>
				</button>
				{#each app.spotsIn(c) as s (s.id)}
					<button
						class="pill chip"
						aria-pressed={app.spot?.id === s.id}
						onclick={() => app.selectSpot(c.id, s.id)}
					>
						{s.name}<span class="mono">{app.countOf(c, s)}</span>
					</button>
				{/each}
			</div>
			{#each groups as g (g.visit)}
				{@const v = visitById.get(g.visit)}
				<div class="trip">
					<div class="trip-head">
						<h3>{v ? longMonthYear(v.start) : ''}</h3>
						{#if v?.label}<span class="trip-label">{v.label}</span>{/if}
						{#if v}<Avatars ids={v.companions} size={26} />{/if}
					</div>
					<div class="grid">
						{#each g.photos as p (p.id)}
							<PhotoTile photo={p} onopen={() => app.openPhoto(p.id)} />
						{/each}
					</div>
				</div>
			{/each}
		{/if}
	</section>
{/if}

<style>
	section {
		display: flex;
		flex-direction: column;
		gap: 20px;
		scroll-margin-top: 16px;
	}
	.bar,
	.title {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
	}
	.title {
		gap: 16px;
	}
	h2 {
		font-size: 28px;
	}
	h2.big {
		font-size: 34px;
	}
	.note {
		margin: 0;
		font-size: 12px;
		color: var(--muted);
	}
	.up {
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}
	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 20px;
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 10px;
		border-radius: var(--radius-card);
		border: 1px solid var(--line);
		background: var(--surface);
		text-align: left;
		transition:
			border-color 120ms,
			transform 160ms var(--ease-out);
	}
	.card:hover {
		border-color: var(--muted);
	}
	.collage {
		display: grid;
		grid-template-columns: 1fr 1fr;
		grid-template-rows: 1fr 1fr;
		gap: 4px;
		width: 100%;
		aspect-ratio: 4 / 3;
		border-radius: 6px;
		overflow: hidden;
	}
	.collage img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		min-height: 0;
	}
	.collage img:first-child {
		grid-row: 1 / 3;
	}
	.card-text {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 0 4px 4px;
	}
	.name {
		font-size: 18px;
		font-weight: 600;
	}
	.card .note {
		font-size: 11px;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.chip {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 14px;
		font-weight: 600;
		transition: border-color 120ms;
	}
	.chip:hover {
		border-color: var(--muted);
	}
	.chip .mono {
		font-size: 11px;
		font-weight: 400;
		opacity: 0.8;
	}
	.chip[aria-pressed='true'] {
		background: var(--pine);
		border-color: var(--pine);
		color: var(--on-pine);
	}
	.trip {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.trip-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px;
		padding-bottom: 10px;
		border-bottom: 1px solid var(--line);
	}
	h3 {
		font-size: 22px;
	}
	.trip-label {
		color: var(--muted);
	}
	.grid {
		columns: 4 240px;
		column-gap: 16px;
	}
</style>
