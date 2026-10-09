// Alpine Morning / Alpine Night base style: OpenFreeMap Positron, restyled per docs/05-map-and-globe.md.
// Structure (widths, dashes, zoom ranges) lives in restyle(); colors live in colorsFor(), so the
// same mapping builds the initial style and repaints the live map when the theme flips.
import type { LayerSpecification, Map as MLMap, StyleSpecification } from 'maplibre-gl';

const BASE = 'https://tiles.openfreemap.org/styles/positron';

// POIs, transit, shields and road names: dropped to keep the map calm.
const DROP =
	/^(aeroway|airport|railway|road_area_pier|road_pier|tunnel_|highway-shield|road_shield|highway-name)/;

export const PALETTES = {
	light: {
		land: '#EEF2EC',
		water: '#B9D2D7',
		coast: 'rgba(45, 90, 67, 0.45)',
		wood: '#DCE6D6',
		park: '#D6E4D1',
		ice: '#F6F9F9',
		residential: '#E6EBE4',
		building: '#E2E6E0',
		buildingLine: '#D3D9D2',
		path: '#9C7B52',
		road: '#FFFFFF',
		casing: '#D5DDD7',
		border: 'rgba(52, 70, 60, 0.6)',
		borderMinor: 'rgba(52, 70, 60, 0.25)',
		halo: 'rgba(255, 255, 255, 0.7)',
		label: '#4F6158',
		labelHalo: '#FFFFFF',
		contour: 'rgba(122, 92, 54, 0.26)',
		contourIndex: 'rgba(122, 92, 54, 0.50)',
		contourLabel: '#6B4F2C',
		contourHalo: 'rgba(214, 228, 230, 0.9)',
		visited: 'rgba(45, 90, 67, 0.12)',
		selected: 'rgba(180, 85, 26, 0.10)',
		ring: '#2D5A43',
		sky: '#D6E4E6',
		horizon: '#E9EFEC'
	},
	dark: {
		land: '#1A2622',
		water: '#0E1E2B',
		coast: 'rgba(127, 196, 160, 0.30)',
		wood: '#1D2C26',
		park: '#1F3028',
		ice: '#2B3639',
		residential: '#1E2A26',
		building: '#253230',
		buildingLine: '#2E3D39',
		path: '#A98A62',
		road: '#33423D',
		casing: '#27342F',
		border: 'rgba(200, 216, 208, 0.45)',
		borderMinor: 'rgba(200, 216, 208, 0.18)',
		halo: 'rgba(15, 25, 22, 0.6)',
		label: '#9FB2A8',
		labelHalo: '#0F1916',
		contour: 'rgba(214, 184, 140, 0.20)',
		contourIndex: 'rgba(214, 184, 140, 0.38)',
		contourLabel: '#CDB48C',
		contourHalo: 'rgba(15, 25, 22, 0.9)',
		visited: 'rgba(127, 196, 160, 0.10)',
		selected: 'rgba(232, 146, 90, 0.16)',
		ring: '#7FC4A0',
		sky: '#0A1320',
		horizon: '#15233A'
	}
};
export type Palette = (typeof PALETTES)['light'];
export const palette = (dark: boolean): Palette => PALETTES[dark ? 'dark' : 'light'];

/** Color paint properties for a layer (ours or the basemap's). */
export function colorsFor(l: { id: string; type: string }, P: Palette): Record<string, unknown> {
	switch (l.id) {
		case 'background':
			return { 'background-color': P.land };
		case 'water':
			return { 'fill-color': P.water, 'fill-outline-color': P.coast };
		case 'waterway':
			return { 'line-color': P.water };
		case 'landcover_wood':
			return { 'fill-color': P.wood };
		case 'park':
			return { 'fill-color': P.park };
		case 'landcover_glacier':
		case 'landcover_ice_shelf':
			return { 'fill-color': P.ice };
		case 'landuse_residential':
			return { 'fill-color': P.residential };
		case 'building':
			return { 'fill-color': P.building, 'fill-outline-color': P.buildingLine };
		case 'highway_path':
			return { 'line-color': P.path };
		case 'boundary_2':
			return { 'line-color': P.border };
		case 'boundary_2_halo':
			return { 'line-color': P.halo };
		case 'boundary_3':
			return { 'line-color': P.borderMinor };
		case 'visited-fill':
			return {
				'fill-color': [
					'case',
					['boolean', ['feature-state', 'selected'], false],
					P.selected,
					P.visited
				]
			};
		case 'ring':
			return { 'line-color': P.ring };
		case 'contour-lines':
			return { 'line-color': ['match', ['get', 'level'], 1, P.contourIndex, P.contour] };
		case 'contour-labels':
			return { 'text-color': P.contourLabel, 'text-halo-color': P.contourHalo };
	}
	if (l.id.includes('casing')) return { 'line-color': P.casing };
	if (l.id.startsWith('highway_')) return { 'line-color': P.road };
	if (l.type === 'symbol') return { 'text-color': P.label, 'text-halo-color': P.labelHalo };
	return {};
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyLayer = LayerSpecification & { paint?: any; layout?: any; minzoom?: number };

/** Structural restyle; colors are layered on top by colorsFor(). */
function restyle(l: AnyLayer): AnyLayer {
	const set = (p: object, extra: object = {}) => ({ ...l, ...extra, paint: { ...l.paint, ...p } });
	switch (l.id) {
		case 'landcover_wood':
		case 'park':
			return set({ 'fill-opacity': 0.8 });
		case 'building':
			return set({}, { minzoom: 14 });
		case 'highway_path':
			return set({ 'line-width': 1, 'line-dasharray': [2, 1.5] }, { minzoom: 12 });
		case 'highway_minor':
			return set({}, { minzoom: 12 });
		case 'boundary_2':
			// soft national borders: dash-dot over a halo (halo layer added in buildStyle)
			return set({
				'line-width': ['step', ['zoom'], 0.9, 3, 1.4],
				'line-dasharray': [4, 2, 1, 2]
			});
	}
	if (l.type === 'symbol')
		return set({ 'text-halo-width': 1.2 }, { minzoom: Math.max(l.minzoom ?? 0, 3) });
	return l;
}

const sky = (P: Palette) => ({
	'sky-color': P.sky,
	'horizon-color': P.horizon,
	'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 0.7, 5, 0.3, 8, 0]
});

export async function buildStyle(dark: boolean): Promise<StyleSpecification> {
	const P = palette(dark);
	const s = (await (await fetch(BASE)).json()) as StyleSpecification;
	delete s.sources.ne2_shaded;
	const layers = (s.layers as AnyLayer[]).filter((l) => !DROP.test(l.id)).map(restyle);
	const b2 = layers.findIndex((l) => l.id === 'boundary_2');
	if (b2 >= 0)
		layers.splice(b2, 0, {
			...layers[b2],
			id: 'boundary_2_halo',
			paint: { 'line-width': ['step', ['zoom'], 2.5, 3, 4] }
		} as AnyLayer);
	s.layers = layers.map((l) => ({ ...l, paint: { ...l.paint, ...colorsFor(l, P) } }));
	s.projection = { type: 'globe' };
	s.sky = sky(P) as StyleSpecification['sky'];
	// theme changes fade over 1.4 s; per-layer *-transition overrides keep interactions snappy
	s.transition = { duration: 1400, delay: 0 };
	return s;
}

/** Repaint the live map for a theme (fades using the style's transition). */
export function applyTheme(map: MLMap, dark: boolean) {
	const P = palette(dark);
	for (const l of map.getStyle().layers)
		for (const [prop, v] of Object.entries(colorsFor(l, P)))
			map.setPaintProperty(l.id, prop as never, v as never);
	map.setSky(sky(P) as never);
}
