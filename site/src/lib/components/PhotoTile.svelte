<script lang="ts">
	import { getSpot, imgUrl, personName, srcset } from '#lib/data.ts';
	import type { Photo } from '#lib/types.ts';
	import Avatars from './Avatars.svelte';

	let { photo, onopen }: { photo: Photo; onopen: () => void } = $props();
	const spot = $derived(getSpot(photo.country, photo.spot));
	const by = $derived(personName(photo.photographer));
	let loaded = $state(false);
	/** fade in once decoded; an image already cached before hydration counts as loaded */
	const watch = (img: HTMLImageElement) => {
		if (img.complete) loaded = true;
	};
</script>

<button
	class="tile press"
	data-photo={photo.id}
	onclick={onopen}
	aria-label="Open photo: {photo.caption ?? spot?.name ?? 'photo'}, by {by}"
>
	<span class="frame" style:background={photo.color}>
		<img
			src={imgUrl(photo, 480)}
			srcset={srcset(photo)}
			sizes="(max-width: 600px) 92vw, 340px"
			width={photo.w}
			height={photo.h}
			alt={photo.caption ?? ''}
			loading="lazy"
			decoding="async"
			class:loaded
			onload={() => (loaded = true)}
			{@attach watch}
		/>
		<span class="badge"><Avatars ids={[photo.photographer]} size={24} /></span>
	</span>
	<span class="cap">
		<span class="place">{spot?.name}</span>
		<span class="by">by {by}</span>
	</span>
</button>

<style>
	.tile {
		display: block;
		width: 100%;
		margin: 0 0 16px;
		padding: 6px;
		border-radius: var(--radius-tile);
		border: 1px solid var(--line);
		background: var(--surface);
		text-align: left;
		cursor: zoom-in;
		break-inside: avoid;
		transition:
			border-color 120ms,
			transform 160ms var(--ease-out);
	}
	.tile:hover {
		border-color: var(--muted);
	}
	.frame {
		position: relative;
		display: block;
		border-radius: 6px;
	}
	img {
		display: block;
		width: 100%;
		height: auto;
		border-radius: 6px;
		transition: opacity 350ms var(--ease-out);
	}
	/* with JS, fade each image in once decoded (without JS they just show) */
	:global(.js) img:not(.loaded) {
		opacity: 0;
	}
	.badge {
		position: absolute;
		left: 8px;
		bottom: 8px;
		display: flex;
	}
	.cap {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		padding: 10px 4px 4px;
		font-size: 14px;
	}
	.place {
		font-weight: 600;
	}
	.by {
		color: var(--muted);
	}
</style>
