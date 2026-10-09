<script lang="ts">
	import { onMount } from 'svelte';
	import { initTheme, theme, toggleTheme } from '#lib/theme.svelte.ts';

	const INSTAGRAM = 'zachhatz';
	onMount(initTheme);
</script>

<header>
	<a class="brand" href="/">
		<span class="word">where's everyone</span>
	</a>
	<nav aria-label="Main" class="mono">
		<a href="#globe">Globe</a>
		<a href="#gallery">Gallery</a>
		<a href="#about">About</a>
		<a class="ig" href="https://instagram.com/{INSTAGRAM}">@{INSTAGRAM}</a>
		<button
			class="theme press"
			class:night={theme.dark}
			aria-pressed={theme.dark}
			aria-label="Night mode"
			title={theme.dark ? 'Switch to day' : 'Switch to night'}
			onclick={toggleTheme}
		>
			<!-- sun -> moon: the disc grows, a "bite" slides in to carve a crescent, the rays retract -->
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<mask id="theme-bite">
					<rect width="24" height="24" fill="#fff" />
					<circle class="bite" r="7" fill="#000" />
				</mask>
				<circle class="disc" cx="12" cy="12" mask="url(#theme-bite)" />
				<g class="rays">
					{#each [0, 45, 90, 135, 180, 225, 270, 315] as a (a)}
						<line x1="12" y1="2.5" x2="12" y2="4.5" transform="rotate({a} 12 12)" />
					{/each}
				</g>
			</svg>
		</button>
	</nav>
</header>

<style>
	header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
	}
	.brand {
		display: flex;
		align-items: baseline;
		gap: 12px;
		text-decoration: none;
	}
	.word {
		font-family: var(--font-display);
		font-weight: 600;
		font-size: 24px;
		letter-spacing: 0.01em;
		color: var(--sunrise);
	}
	nav {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	nav a {
		padding: 12px 14px;
		color: var(--muted);
		text-decoration: none;
		font-size: 13px;
	}
	nav a:hover {
		color: var(--ink);
	}
	nav a.ig {
		color: var(--pine);
	}

	.theme {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		margin-left: 6px;
		border-radius: 50%;
		border: 1px solid var(--line);
		background: var(--surface);
		color: var(--sunrise);
	}
	.theme:hover {
		border-color: var(--muted);
	}
	svg {
		width: 22px;
		height: 22px;
		overflow: visible;
		/* the whole icon turns a little as day becomes night, like the sky wheeling over */
		transition: rotate 700ms var(--ease-out);
	}
	.night svg {
		rotate: -40deg;
	}
	.disc {
		r: 4.5px;
		fill: currentColor;
		transition: r 500ms var(--ease-out);
	}
	.night .disc {
		r: 8px;
	}
	.bite {
		cx: 26px;
		cy: -2px;
		transition:
			cx 500ms var(--ease-out),
			cy 500ms var(--ease-out);
	}
	.night .bite {
		cx: 17px;
		cy: 8px;
	}
	.rays {
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		transform-origin: 12px 12px;
		transition:
			scale 400ms var(--ease-out),
			opacity 300ms;
	}
	.night .rays {
		scale: 0.4;
		opacity: 0;
	}
	.night {
		color: #e9e4c8; /* moonlight */
	}
</style>
