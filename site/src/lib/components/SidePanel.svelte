<script lang="ts">
	import { personName } from '#lib/data.ts';
	import { range, visitsShort } from '#lib/dates.ts';
	import { coord, names, plural } from '#lib/format.ts';
	import { arrive } from '#lib/motion.ts';
	import { app } from '#lib/state.svelte.ts';
	import { countdown } from '#lib/trips.ts';
	import type { Country, Spot } from '#lib/types.ts';
	import Avatars from './Avatars.svelte';

	/** a spot's newest (filtered) visit range without the year: "Apr 16 – 18" */
	const spotRange = (s: Spot) => {
		const v = app.spotVisitsOf(s)[0];
		return v ? range(v.start, v.end, false) : '';
	};

	type Card = {
		id: string;
		start: string;
		end: string;
		photos: number;
		label?: string;
		people: string[];
	};
</script>

{#snippet tripCard(t: Card)}
	{@const on = app.nav.trip === t.id}
	<!-- a trip card is also the quickest Trip filter: click to show only this trip, again to clear -->
	<button
		class="trip press"
		class:on
		aria-pressed={on}
		title={on ? 'Show all trips again' : 'Show only this trip'}
		onclick={() => app.setTrip(on ? null : t.id)}
	>
		<div class="trip-top">
			<span class="trip-date">{range(t.start, t.end)}</span>
			<span class="mono count">{plural(t.photos, 'photo')}</span>
		</div>
		{#if t.label}<span class="trip-label">{t.label}</span>{/if}
		<div class="trip-people">
			<Avatars ids={t.people} />
			<span>{names(t.people.map(personName))}</span>
		</div>
	</button>
{/snippet}

{#snippet spotRows(c: Country)}
	<div class="list">
		{#each app.spotsIn(c) as s (s.id)}
			{@const on = app.spot?.id === s.id}
			<button
				class="row spot"
				class:on
				aria-pressed={on}
				onclick={() => (on ? app.selectCountry(c.id) : app.selectSpot(c.id, s.id))}
			>
				<span class="name">{s.name}</span>
				<span class="mono right">
					<span class="dates">{spotRange(s)}</span>
					{app.countOf(c, s)}
				</span>
			</button>
		{/each}
	</div>
{/snippet}

<aside>
	{#key `${app.nav.c}/${app.nav.s}`}
		<div class="content" in:arrive>
			{#if !app.country}
				<span class="label">Destinations</span>
				{#if app.countries.length === 0}
					<p class="empty">
						{app.filtering ? 'No trips match these filters.' : 'Photos coming soon.'}
					</p>
				{/if}
				<div class="list">
					{#each app.countries as c (c.id)}
						<button class="row dest" onclick={() => app.selectCountry(c.id)}>
							<span class="col">
								<span class="name">{c.name}</span>
								<span class="mono meta">{visitsShort(app.visitsOf(c).map((v) => v.start))}</span>
							</span>
							<span class="mono count">{app.countOf(c)}</span>
						</button>
					{/each}
				</div>
				{#if app.upcoming.length && app.now}
					{@const now = app.now}
					<span class="label trips-label">Upcoming trips</span>
					<div class="list">
						{#each app.upcoming as t (t.id)}
							<button class="row upcoming" onclick={() => app.showTrip(t)}>
								<span class="ring" aria-hidden="true"></span>
								<span class="col grow">
									<span class="name">{t.name}</span>
									<span class="mono meta">{range(t.start, t.end)}</span>
								</span>
								<span class="mono soon">{countdown(t, now)}</span>
							</button>
						{/each}
					</div>
				{/if}
			{:else if !app.spot}
				{@const c = app.country}
				{@const trips = app.visitsOf(c)}
				<button class="pill back mono" onclick={app.world}>← All destinations</button>
				<div class="col head">
					<h2>{c.name}</h2>
					{#each trips as v (v.id)}
						<span class="visited"
							>Visited {range(v.start, v.end)}{v.label ? ` · ${v.label}` : ''}</span
						>
					{/each}
					<span class="mono meta">{coord(c.lat, c.lon)} · {plural(app.countOf(c), 'photo')}</span>
				</div>
				<span class="label">{trips.length === 1 ? 'Trip' : 'Trips here'}</span>
				{#each trips as v (v.id)}
					{@render tripCard({ ...v, people: v.companions })}
				{/each}
				<span class="label">Spots</span>
				{@render spotRows(c)}
				<a class="mono jump" href="#gallery">View {plural(app.gallery.length, 'photo')} ↓</a>
			{:else}
				{@const c = app.country}
				{@const s = app.spot}
				{@const trips = app.spotVisitsOf(s)}
				<button class="pill back mono" onclick={app.up}>← {app.area?.name ?? c.name}</button>
				<div class="col head">
					<h2>{s.name}</h2>
					<span class="visited">
						{c.name} · {trips.length === 1
							? range(trips[0].start, trips[0].end)
							: plural(trips.length, 'trip')}
					</span>
					<span class="mono meta">{coord(s.lat, s.lon)} · {plural(app.countOf(c, s), 'photo')}</span
					>
				</div>
				<span class="label">{trips.length === 1 ? 'Trip' : 'Trips here'}</span>
				{#each trips as v (v.visit)}
					{@render tripCard({
						...v,
						id: v.visit,
						label: c.visits.find((x) => x.id === v.visit)?.label
					})}
				{/each}
				<span class="label">Spots in {c.name}</span>
				{@render spotRows(c)}
				<a class="mono jump" href="#gallery">View {plural(app.gallery.length, 'photo')} ↓</a>
			{/if}
		</div>
	{/key}
</aside>

<style>
	aside {
		flex: 1 1 300px;
		min-width: 0;
		padding: 28px 24px;
		display: flex;
		flex-direction: column;
		gap: 18px;
		background: var(--panel);
		border-left: 1px solid var(--line);
	}
	.content {
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	.list,
	.col {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.col {
		gap: 2px;
	}
	.head {
		gap: 6px;
	}
	h2 {
		font-size: 34px;
	}
	.dest {
		min-height: 56px;
	}
	.name {
		font-size: 17px;
		font-weight: 600;
	}
	.spot .name {
		font-size: 16px;
		color: var(--ink);
	}
	.meta {
		font-size: 11px;
		color: var(--muted);
	}
	.head .meta {
		font-size: 12px;
	}
	.visited {
		font-size: 15px;
		color: var(--caption);
	}
	.count,
	.spot {
		font-size: 13px;
		color: var(--pine);
	}
	.right {
		display: flex;
		align-items: baseline;
		gap: 10px;
		white-space: nowrap;
	}
	.dates {
		font-size: 11px;
		color: var(--muted);
	}
	.spot.on {
		background: var(--pine);
		border-color: var(--pine);
		color: var(--on-pine);
	}
	.spot.on .name,
	.spot.on .dates {
		color: var(--on-pine);
	}
	.back {
		align-self: flex-start;
		color: var(--muted);
		font-size: 12px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.label {
		margin-top: 4px;
	}
	.trip {
		display: flex;
		flex-direction: column;
		gap: 8px;
		width: 100%;
		padding: 14px;
		border-radius: var(--radius-row);
		border: 1px solid var(--line);
		background: var(--card);
		text-align: left;
	}
	.trip:hover {
		border-color: var(--muted);
	}
	.trip.on {
		border-color: var(--pine);
		box-shadow: inset 0 0 0 1px var(--pine);
	}
	.trip-top {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 12px;
	}
	.trip-date {
		font-size: 16px;
		font-weight: 700;
	}
	.trip .count {
		font-size: 12px;
		white-space: nowrap;
	}
	.trip-label {
		color: var(--muted);
	}
	.trip-people {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 14px;
	}
	.jump {
		font-size: 12px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		padding: 12px 0;
	}
	.trips-label {
		color: var(--upcoming);
		padding-top: 6px;
	}
	.upcoming {
		min-height: 56px;
		justify-content: flex-start;
		border-style: dashed;
		border-color: var(--upcoming-line);
		background: var(--upcoming-soft);
	}
	.upcoming:hover {
		border-color: var(--upcoming);
	}
	.upcoming .name {
		font-size: 16px;
	}
	.ring {
		flex: none;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		border: 2.5px solid var(--upcoming);
	}
	.grow {
		flex: 1;
		min-width: 0;
	}
	.soon {
		font-size: 12px;
		color: var(--upcoming);
		white-space: nowrap;
	}
	.empty {
		margin: 0;
		color: var(--muted);
	}
	/* beside the map: never taller than it (a long spot list would stretch the section and leave
	   empty space under the map), so the panel scrolls on its own instead */
	@media (min-width: 961px) {
		aside {
			max-height: var(--stage-h);
			overflow-y: auto;
			overscroll-behavior: contain;
			scrollbar-width: thin;
			scrollbar-color: var(--line) transparent;
		}
	}
	/* under the map (phones/tablets): grows with its content as part of the page */
	@media (max-width: 960px) {
		aside {
			border-left: 0;
			border-top: 1px solid var(--line);
		}
	}
</style>
