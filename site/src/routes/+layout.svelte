<script lang="ts">
	import favicon from '#lib/assets/favicon.svg';
	import '@fontsource/fraunces/latin-500.css';
	import '@fontsource/fraunces/latin-600.css';
	import '@fontsource/karla/latin-400.css';
	import '@fontsource/karla/latin-500.css';
	import '@fontsource/karla/latin-600.css';
	import '@fontsource/karla/latin-700.css';
	import '@fontsource/ibm-plex-mono/latin-400.css';
	import '@fontsource/ibm-plex-mono/latin-500.css';
	import '#lib/styles/tokens.css';
	import '#lib/styles/base.css';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
