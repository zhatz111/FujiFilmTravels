<script lang="ts">
	// "Currently in X · through DATE · Show on globe →" while a trip is live (client-only);
	// on phones the second half drops to its own line.
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
		<span class="text">
			<b>Currently in {t.name}</b>
			<span class="sub">
				{#if !t.hide_end_date}<span class="through">through {monthDay(t.end)}</span><span
						class="sep"
						aria-hidden="true">·</span
					>{/if}<span class="mono go">Show on globe →</span>
			</span>
		</span>
	</button>
{/if}

<style>
	/* dot | text on one row; on phones the text splits into two lines:
	   "Currently in X" / "through DATE · Show on globe →" */
	.live {
		align-self: flex-start;
		display: grid;
		grid-template-columns: auto 1fr;
		align-items: center;
		column-gap: 12px;
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
	.text,
	.sub {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		column-gap: 8px;
	}
	.sub::before {
		content: '·'; /* joins the two halves on one line; gone once they're stacked */
		color: var(--pine);
	}
	.through,
	.sep {
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
			border-radius: 16px; /* a full pill looks odd once it's two lines tall */
		}
		.text {
			flex-direction: column;
			row-gap: 2px;
		}
		.sub::before {
			content: none;
		}
		.dot {
			align-self: start;
			margin-top: 5px; /* line up with the first line of text */
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
