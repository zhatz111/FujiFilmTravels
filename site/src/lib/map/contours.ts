// Elevation contours from a free Terrarium DEM via maplibre-contour (docs/05-map-and-globe.md).
// Progressive enhancement: if the DEM or the library fails, the map still works.
import type { Map as MLMap } from 'maplibre-gl';
import { colorsFor, type Palette } from './style';

const DEM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
/** Subtle hillshade from the same DEM. Off until it's proven calm and fast on a phone. */
const HILLSHADE = false;

export async function addContours(
	map: MLMap,
	maplibre: typeof import('maplibre-gl'),
	before: string,
	P: Palette
) {
	try {
		const { default: mlcontour } = await import('maplibre-contour');
		const dem = new mlcontour.DemSource({
			url: DEM,
			encoding: 'terrarium',
			maxzoom: 13,
			worker: true
		});
		dem.setupMaplibre(maplibre as never);

		if (HILLSHADE) {
			map.addSource('dem', {
				type: 'raster-dem',
				tiles: [dem.sharedDemProtocolUrl],
				tileSize: 256,
				maxzoom: 13,
				encoding: 'terrarium'
			});
			map.addLayer(
				{
					id: 'hillshade',
					type: 'hillshade',
					source: 'dem',
					paint: {
						'hillshade-exaggeration': 0.25,
						'hillshade-shadow-color': '#9FB3AC',
						'hillshade-highlight-color': '#FFFFFF'
					}
				},
				before
			);
		}

		map.addSource('contours', {
			type: 'vector',
			tiles: [
				dem.contourProtocolUrl({
					thresholds: {
						4: [500, 2000],
						6: [250, 1000],
						8: [200, 1000],
						10: [100, 500],
						12: [50, 250],
						14: [20, 100]
					},
					contourLayer: 'contours',
					elevationKey: 'ele',
					levelKey: 'level'
				})
			],
			maxzoom: 15
		});
		// level 1 = major (index) line, level 0 = minor
		map.addLayer(
			{
				id: 'contour-lines',
				type: 'line',
				source: 'contours',
				'source-layer': 'contours',
				minzoom: 3,
				filter: ['>', ['get', 'ele'], 0], // the DEM includes sea-floor depths; land only
				paint: {
					...colorsFor({ id: 'contour-lines', type: 'line' }, P),
					'line-width': ['match', ['get', 'level'], 1, 1.4, 0.9]
				}
			},
			before
		);
		map.addLayer({
			id: 'contour-labels',
			type: 'symbol',
			source: 'contours',
			'source-layer': 'contours',
			minzoom: 6,
			filter: ['all', ['>', ['get', 'level'], 0], ['>', ['get', 'ele'], 0]],
			layout: {
				'symbol-placement': 'line',
				'text-field': ['concat', ['number-format', ['get', 'ele'], {}], ' m'],
				'text-font': ['Noto Sans Regular'],
				'text-size': 10
			},
			paint: {
				...colorsFor({ id: 'contour-labels', type: 'symbol' }, P),
				'text-halo-width': 1.2
			}
		});
	} catch (e) {
		console.warn('Contours unavailable', e);
	}
}
