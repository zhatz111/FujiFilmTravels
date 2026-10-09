<script lang="ts">
	import { onMount } from 'svelte';
	import { countries, photos, spots } from '#lib/data.ts';
	import LiveBanner from './LiveBanner.svelte';

	const stats = [
		{ n: countries.length, label: 'Countries', color: 'var(--slate)' },
		{ n: spots.length, label: 'Spots', color: 'var(--sunrise)' },
		{ n: photos.length, label: 'Photos', color: 'var(--pine)' }
	];
	// prerendered with the real numbers; after load they count up quickly (fast start, soft landing)
	let shown = $state(stats.map((s) => s.n));

	onMount(() => {
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		const t0 = performance.now();
		const ease = (t: number) => 1 - (1 - t) ** 4; // ease-out quart: no overshoot
		let raf = 0;
		const frame = (now: number) => {
			let done = true;
			shown = stats.map((s, i) => {
				const t = Math.min(1, Math.max(0, (now - t0 - i * 90) / 900)); // 90 ms stagger
				if (t < 1) done = false;
				return Math.round(s.n * ease(t));
			});
			if (!done) raf = requestAnimationFrame(frame);
		};
		raf = requestAnimationFrame(frame);
		return () => cancelAnimationFrame(raf);
	});
</script>

<section class="hero">
	<div class="intro">
		<h1>Places we've pointed a camera at.</h1>
		<p>
			Nature and travel photography, pinned to where each frame was shot. Spin the globe, pick a
			destination, and fly in.
		</p>
		<LiveBanner />
	</div>
	<dl class="stats mono">
		{#each stats as s, i (s.label)}
			<div>
				<dd style:color={s.color} aria-label={`${s.n}`}>{shown[i]}</dd>
				<dt>{s.label}</dt>
			</div>
		{/each}
	</dl>
</section>

<style>
	.hero {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 24px;
	}
	.intro {
		display: flex;
		flex-direction: column;
		gap: 14px;
		max-width: 820px;
	}
	h1 {
		font-size: 54px;
		line-height: 1.05;
		letter-spacing: 0.01em;
	}
	p {
		margin: 0;
		font-size: 18px;
		line-height: 1.5;
		color: var(--muted);
	}
	.stats {
		display: flex;
		gap: 32px;
		margin: 0;
	}
	.stats div {
		display: flex;
		flex-direction: column-reverse;
		gap: 4px;
	}
	dd {
		margin: 0;
		font-size: 30px;
	}
	dt {
		font-size: 11px;
		color: var(--muted);
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	@media (max-width: 720px) {
		h1 {
			font-size: 36px;
		}
	}
</style>
