<script lang="ts">
	// "Currently in X · through DATE — Show on globe →" while a trip is live (client-only).
	import { monthDay } from '#lib/dates.ts';
	import { app } from '#lib/state.svelte.ts';

	function show() {
		app.showTrip(app.live!);
		document.getElementById('globe')?.scrollIntoView({ block: 'start' });
	}
</script>

{#if app.live}
	{@const t = app.live}
	<button class="live" onclick={show}>
		<span class="dot" aria-hidden="true"><i></i><i></i></span>
		<span>
			<b>Currently in {t.name}</b>{#if !t.hide_end_date}<span class="through"
					>{` · through ${monthDay(t.end)}`}</span
				>{/if}
		</span>
		<span class="mono go">Show on globe →</span>
	</button>
{/if}

<style>
	/* dot | text | link on one row; on narrow screens the link drops under the text,
	   and the dot stays beside the first line instead of wrapping onto its own */
	.live {
		align-self: flex-start;
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		column-gap: 12px;
		row-gap: 4px;
		min-height: 48px;
		padding: 8px 18px 8px 14px;
		border-radius: var(--radius-pill);
		border: 1px solid var(--live-line);
		background: var(--live-soft);
		color: var(--live-ink);
		font-size: 15px;
		text-align: left;
		transition: border-color 120ms;
	}
	.live:hover {
		border-color: var(--live);
	}
	.through {
		color: var(--pine);
	}
	.go {
		white-space: nowrap;
		font-size: 11px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--pine);
	}
	.dot {
		position: relative;
		flex: none;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--live);
		border: 2px solid #fff;
	}
	.dot i {
		position: absolute;
		inset: -2px;
		border-radius: 50%;
		background: var(--live);
		animation: live-pulse 1.8s ease-out infinite;
	}
	.dot i + i {
		animation-delay: 0.9s;
	}
	@media (max-width: 560px) {
		.live {
			grid-template-columns: auto 1fr;
			border-radius: 16px; /* a full pill looks odd once it's two lines tall */
		}
		.dot {
			align-self: start;
			margin-top: 4px; /* line up with the first line of text */
		}
		.go {
			grid-column: 2;
		}
	}
	@keyframes live-pulse {
		from {
			transform: scale(1);
			opacity: 0.6;
		}
		to {
			transform: scale(2.8);
			opacity: 0;
		}
	}
</style>
