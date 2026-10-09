// Camera choreography per transition (docs/05-map-and-globe.md). Every move resolves when the
// camera settles (or is interrupted), so callers can await it before dropping pins.
import type { Map as MLMap } from 'maplibre-gl';

export const WORLD_CENTER: [number, number] = [-40, 18];

/** Zoom 1.6 fills ~75% of a 640px-tall desktop stage; scale for smaller stages (phones). */
export const worldZoom = (el: HTMLElement) =>
	1.6 + Math.min(0, Math.log2(Math.min(el.clientWidth, el.clientHeight) / 640));

export const reducedMotion = () =>
	typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

type Target = { lon: number; lat: number; zoom: number };

let cancelTween: (() => void) | null = null;

/** Stop whatever the camera is doing (a new move starts, or the user grabbed the globe).
 *  `keepGesture` only cancels our own tween: map.stop() also resets MapLibre's gesture
 *  handlers, which would end the drag the user just started. */
export function stop(map: MLMap, keepGesture = false) {
	cancelTween?.();
	cancelTween = null;
	if (!keepGesture) map.stop();
}

/** Run a MapLibre move and resolve on its moveend. */
function settle(map: MLMap, move: () => void): Promise<void> {
	return new Promise((resolve) => {
		map.once('moveend', () => resolve());
		move();
	});
}

function tween(ms: number, step: (t: number) => void): Promise<boolean> {
	return new Promise((resolve) => {
		let alive = true;
		cancelTween = () => {
			alive = false;
			resolve(false);
		};
		const t0 = performance.now();
		const frame = (now: number) => {
			if (!alive) return;
			const t = Math.min(1, (now - t0) / ms);
			step(ease(t));
			if (t < 1) requestAnimationFrame(frame);
			else {
				cancelTween = null;
				resolve(true);
			}
		};
		requestAnimationFrame(frame);
	});
}

export const countryZoom = (z: number) => clamp(z, 3, 9);
// pipeline zoom fits radius x1.25, which is exactly the dashed ring; back off so the ring + label fit
export const spotZoom = (z: number) => clamp(z - 0.5, 11, 16);

/** Instant move: first paint of a deep link, or reduced motion. */
export function jump(map: MLMap, t: Target) {
	stop(map);
	return settle(map, () => map.jumpTo({ center: [t.lon, t.lat], zoom: t.zoom }));
}

/** World -> Country: one extra spin while pulling back (~1.2 s), then dive in (~1.4 s). */
export async function spinIn(map: MLMap, t: Target) {
	stop(map);
	const zoom = countryZoom(t.zoom);
	if (reducedMotion()) return jump(map, { ...t, zoom });
	const from = map.getCenter();
	const z0 = map.getZoom();
	const delta = (((t.lon - from.lng) % 360) + 360) % 360;
	const turn = delta + (delta < 180 ? 360 : 0); // always spin forward, at least half a turn more
	const done = await tween(1200, (k) =>
		map.jumpTo({
			center: [from.lng + turn * k, from.lat + (t.lat - from.lat) * k * 0.6],
			zoom: z0 - 0.4 * Math.sin(Math.PI * k)
		})
	);
	if (!done) return;
	return settle(map, () => map.flyTo({ center: [t.lon, t.lat], zoom, duration: 1400, curve: 1.4 }));
}

/** Country/Spot -> Country, or Country -> Spot (curve 1.2: pan first, zoom last),
 *  or Spot -> sibling Spot (curve 1.8: zooms out to country level mid-flight). */
export function flyTo(map: MLMap, t: Target, curve = 1.42, duration = 1900) {
	stop(map);
	if (reducedMotion()) return jump(map, t);
	return settle(map, () => map.flyTo({ center: [t.lon, t.lat], zoom: t.zoom, curve, duration }));
}

/** Anything -> World, from wherever the camera is (even zoomed and panned at World level):
 *  back to the default view (default latitude, world zoom, flat), keeping the current longitude
 *  so the globe doesn't whip around, then the caller resumes auto-spin. */
export function home(map: MLMap) {
	stop(map);
	const t = {
		center: [map.getCenter().lng, WORLD_CENTER[1]] as [number, number],
		zoom: worldZoom(map.getContainer()),
		bearing: 0,
		pitch: 0
	};
	if (reducedMotion()) return settle(map, () => map.jumpTo(t));
	// flyTo zooms out first and pans on the way, like pulling back to see the whole planet
	return settle(map, () => map.flyTo({ ...t, duration: 1300, curve: 1.3 }));
}
