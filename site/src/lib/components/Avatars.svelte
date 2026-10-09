<script lang="ts">
	// Avatar stack: person-colored circles with initials, overlapping, max 4 then "+n".
	import { initials, personById } from '#lib/data.ts';

	let { ids, size = 28 }: { ids: string[]; size?: number } = $props();
	const list = $derived(ids.map((id) => personById.get(id)).filter((p) => !!p));
</script>

<span class="stack" style:--size="{size}px" aria-hidden="true">
	{#each list.slice(0, 4) as p (p.id)}
		<span class="av" style:background={p.color} title={p.name}>{initials(p)}</span>
	{/each}
	{#if list.length > 4}
		<span class="av more">+{list.length - 4}</span>
	{/if}
</span>

<style>
	.stack {
		display: inline-flex;
		flex: none;
	}
	.av {
		display: grid;
		place-items: center;
		width: var(--size);
		height: var(--size);
		border-radius: 50%;
		border: 2px solid var(--surface);
		color: #fff;
		font: 700 calc(var(--size) * 0.42) / 1 var(--font-body);
	}
	.av + .av {
		margin-left: -8px;
	}
	.more {
		background: var(--line);
		color: var(--ink);
	}
</style>
