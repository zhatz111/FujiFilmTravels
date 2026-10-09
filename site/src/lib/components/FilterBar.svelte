<script lang="ts">
	// The one filtering UI (Phase 4.6): Traveler + Trip, applied to pins, panels, gallery, lightbox.
	import { longMonthYear } from '#lib/dates.ts';
	import { people } from '#lib/data.ts';
	import { plural } from '#lib/format.ts';
	import { app } from '#lib/state.svelte.ts';
</script>

<div class="bar" role="search" aria-label="Filter the map and photos">
	<label>
		Traveler
		<select value={app.nav.who ?? ''} onchange={(e) => app.setWho(e.currentTarget.value || null)}>
			<option value="">Everyone</option>
			{#each people as p (p.id)}
				<option value={p.id}>{p.name}</option>
			{/each}
		</select>
	</label>
	<label>
		Trip
		<select value={app.nav.trip ?? ''} onchange={(e) => app.setTrip(e.currentTarget.value || null)}>
			<option value="">All trips</option>
			{#each app.tripOptions as v (v.id)}
				<option value={v.id}>{longMonthYear(v.start)}{v.label ? ` · ${v.label}` : ''}</option>
			{/each}
		</select>
	</label>
	<div class="result">
		<span class="mono" aria-live="polite">
			{plural(app.scope.photos, 'photo')} · {plural(app.scope.trips, 'trip')}
		</span>
		{#if app.filtering}
			<button class="pill" onclick={app.clearFilters}>Clear filters</button>
		{/if}
	</div>
</div>

<style>
	.bar {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 16px 20px;
		padding: 16px 20px;
		border-radius: 14px;
		border: 1px solid var(--line);
		background: var(--surface);
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font: 500 11px var(--font-mono);
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--muted);
	}
	select {
		min-height: 44px;
		min-width: 220px;
		padding: 0 36px 0 12px;
		border-radius: 10px;
		border: 1px solid var(--line);
		background: var(--card)
			url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%232D5A43' stroke-width='1.6'/%3E%3C/svg%3E")
			no-repeat right 14px center;
		appearance: none;
		font: 600 16px var(--font-body);
		color: var(--ink);
		letter-spacing: 0;
		text-transform: none;
		cursor: pointer;
	}
	select:hover {
		border-color: var(--muted);
	}
	/* native-menu browsers: a lighter chevron at night (base-select browsers use the mask below) */
	@supports not (appearance: base-select) {
		:global([data-theme='dark']) select {
			background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%237FC4A0' stroke-width='1.6'/%3E%3C/svg%3E");
		}
	}
	/* Styled dropdown menu where supported (Chrome/Edge 135+); other browsers keep the native menu */
	@supports (appearance: base-select) {
		select,
		select::picker(select) {
			appearance: base-select;
		}
		select {
			display: flex;
			align-items: center;
			padding: 0 14px 0 12px;
			background-image: none;
		}
		select::picker-icon {
			content: '';
			width: 12px;
			height: 8px;
			margin-left: auto;
			/* a mask, so the chevron takes the theme's pine */
			background: var(--pine);
			mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%232D5A43' stroke-width='1.6'/%3E%3C/svg%3E")
				no-repeat center;
			transition: rotate 120ms;
		}
		select:open::picker-icon {
			rotate: 180deg;
		}
		select:open {
			border-color: var(--pine);
		}
		select::picker(select) {
			margin-top: 6px;
			padding: 6px;
			border-radius: 10px;
			border: 1px solid var(--line);
			background: var(--card);
			box-shadow: 0 10px 30px rgba(0, 0, 0, 0.14);
		}
		option {
			min-height: 40px;
			padding: 8px 10px;
			border-radius: 6px;
			font: 600 15px var(--font-body);
			color: var(--ink);
		}
		option:hover,
		option:focus-visible {
			background: var(--surface);
			outline: none;
		}
		option:checked {
			color: var(--pine);
			background: var(--pine-tint);
		}
		option::checkmark {
			display: none;
		}
	}
	.result {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-left: auto;
		min-height: 44px;
	}
	.result .mono {
		font-size: 13px;
		color: var(--pine);
	}
	.pill {
		font-size: 14px;
		font-weight: 600;
		background: var(--surface);
	}
	@media (max-width: 720px) {
		label,
		select {
			width: 100%;
		}
		.result {
			margin-left: 0;
		}
	}
</style>
