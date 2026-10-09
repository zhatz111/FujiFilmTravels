// Warm the browser's HTTP cache with the vector tiles a camera move is about to need, so diving
// into a country or spot doesn't show the map popping in. OpenFreeMap tiles are immutable and
// cached for 10 years, so a prefetched tile is reused by MapLibre with no network round trip.
import type { Map as MLMap, VectorTileSource } from 'maplibre-gl';

const done = new Set<string>();
const MAX_VECTOR_Z = 14; // OpenMapTiles planet maxzoom; MapLibre overzooms above it

function tileXY(lon: number, lat: number, z: number) {
	const n = 2 ** z;
	const r = (lat * Math.PI) / 180;
	return {
		x: Math.floor(((lon + 180) / 360) * n),
		y: Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n)
	};
}

/** Prefetch a 3x3 block of vector tiles around lon/lat at the zoom the camera will land on
 *  and one level below (what's visible mid-dive). */
export function prefetch(map: MLMap, lon: number, lat: number, zoom: number) {
	const tpl = (map.getSource('openmaptiles') as VectorTileSource | undefined)?.tiles?.[0];
	if (!tpl) return;
	const top = Math.min(MAX_VECTOR_Z, Math.floor(zoom));
	for (const z of [top, top - 1]) {
		if (z < 0) continue;
		const c = tileXY(lon, lat, z);
		const n = 2 ** z;
		for (let dx = -1; dx <= 1; dx++)
			for (let dy = -1; dy <= 1; dy++) {
				const x = (c.x + dx + n) % n;
				const y = c.y + dy;
				if (y < 0 || y >= n) continue;
				const url = tpl.replace('{z}', `${z}`).replace('{x}', `${x}`).replace('{y}', `${y}`);
				if (done.has(url)) continue;
				done.add(url);
				fetch(url, { priority: 'low' } as RequestInit).catch(() => done.delete(url));
			}
	}
}
