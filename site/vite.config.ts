import { defineConfig } from 'vitest/config';
import type { Connect, Plugin } from 'vite';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { createReadStream, existsSync } from 'node:fs';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const photosOut = fileURLToPath(new URL('../photos/out', import.meta.url));

/** Serves pipeline output (photos/out/p/*.webp) at /p/* in dev and preview, standing in for R2. */
function localImages(): Plugin {
	const serve: Connect.NextHandleFunction = (req, res, next) => {
		if (!req.url?.startsWith('/p/')) return next();
		const file = join(photosOut, decodeURIComponent(req.url.split('?')[0]));
		if (!file.startsWith(photosOut + sep) || !existsSync(file)) return next();
		res.setHeader('Content-Type', 'image/webp');
		createReadStream(file).pipe(res);
	};
	return {
		name: 'local-images',
		configureServer: (s) => void s.middlewares.use(serve),
		configurePreviewServer: (s) => void s.middlewares.use(serve)
	};
}

export default defineConfig({
	plugins: [
		localImages(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
			prerender: {
				// local image paths (/p/*) only exist on the dev/preview server; production uses R2 URLs
				handleHttpError: ({ path, message }) => {
					if (!path.startsWith('/p/')) throw new Error(message);
				}
			}
		})
	],
	// R2 image domain in production (set PUBLIC_IMG_BASE in the build env); empty = local /p
	define: { __IMG_BASE__: JSON.stringify(process.env.PUBLIC_IMG_BASE ?? '') },
	// MapLibre v6 loads its worker relative to its own module; pre-bundling would move it away
	optimizeDeps: { exclude: ['maplibre-gl'] },
	server: { fs: { allow: ['../data'] } },
	test: {
		expect: { requireAssertions: true },
		passWithNoTests: true,
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
