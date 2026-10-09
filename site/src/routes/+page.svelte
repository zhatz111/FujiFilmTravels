<script lang="ts">
	import { onMount } from 'svelte';
	import FilterBar from '#lib/components/FilterBar.svelte';
	import Footer from '#lib/components/Footer.svelte';
	import Gallery from '#lib/components/Gallery.svelte';
	import Header from '#lib/components/Header.svelte';
	import Hero from '#lib/components/Hero.svelte';
	import * as lightbox from '#lib/components/Lightbox.ts';
	import SidePanel from '#lib/components/SidePanel.svelte';
	import Globe from '#lib/map/Globe.svelte';
	import { app } from '#lib/state.svelte.ts';

	// URL -> state: initial load (after hydration, so the prerendered HTML matches) and back/forward
	const sync = () => app.syncFromUrl(location.search);
	onMount(() => {
		sync();
		return app.startClock(); // trip status is browser-only (after hydration), re-checked every 10 min
	});

	// state -> lightbox
	$effect(() => {
		const p = app.photo;
		const list = app.gallery;
		if (!p) return lightbox.close();
		const i = list.findIndex((x) => x.id === p.id);
		if (i >= 0) lightbox.open(list, i, app.showPhoto, app.closePhoto);
	});

	function onkeydown(e: KeyboardEvent) {
		// Esc: PhotoSwipe closes itself first; otherwise go up one level
		if (e.key !== 'Escape' || lightbox.isOpen() || app.level === 'world') return;
		if ((e.target as HTMLElement).closest('input, select, textarea')) return;
		app.up();
	}

	const title = $derived(
		[app.spot?.name, app.country?.name, "where's everyone"].filter(Boolean).join(' · ')
	);
</script>

<svelte:window {onkeydown} onpopstate={sync} />
<svelte:head>
	<title>{title}</title>
	<meta
		name="description"
		content="Nature and travel photography by Zach and friends, pinned to where each frame was shot."
	/>
</svelte:head>

<div class="page">
	<Header />
	<Hero />
	<FilterBar />
	<section id="globe" class="globe" aria-label="Photo globe">
		<Globe />
		<SidePanel />
	</section>
	<Gallery />
	<Footer />
</div>

<style>
	.page {
		max-width: 1440px;
		margin: 0 auto;
		padding: 28px 32px 64px;
		display: flex;
		flex-direction: column;
		gap: 32px;
	}
	.globe {
		display: flex;
		flex-wrap: wrap;
		border-radius: var(--radius-stage);
		overflow: hidden;
		border: 1px solid var(--line);
		background: var(--stage-gradient);
		box-shadow: var(--shadow-stage);
		scroll-margin-top: 16px;
	}
	@media (max-width: 720px) {
		.page {
			padding: 20px 16px 48px;
		}
	}
</style>
