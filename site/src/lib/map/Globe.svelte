<script lang="ts">
	// Owns the MapLibre instance. The rest of the app talks to it only through `app`:
	// state changes -> camera + markers here; marker clicks -> app actions.
	import { onMount, untrack } from 'svelte';
	import type { GeoJSONSource, Map as MLMap, Marker } from 'maplibre-gl';
	import type Supercluster from 'supercluster';
	import visitedUrl from '../../../../data/visited-countries.geojson?url';
	import { countryById, getSpot, personById, personName } from '#lib/data.ts';
	import { monthDay, range, years } from '#lib/dates.ts';
	import { coord, plural } from '#lib/format.ts';
	import { app } from '#lib/state.svelte.ts';
	import { displayPoint, shortName } from '#lib/trips.ts';
	import type { Country, Photo, Spot } from '#lib/types.ts';
	import * as cam from './camera';
	import { addContours } from './contours';
	import {
		circle,
		countryPin,
		photoPin,
		ringLabel,
		spotClusterPin,
		spotPin,
		tripPin
	} from './markers';
	import { groupNearby, type Group } from './group';
	import { prefetch } from './prefetch';
	import { theme } from '#lib/theme.svelte.ts';
	import { applyTheme, buildStyle, colorsFor, palette } from './style';

	let container: HTMLDivElement;
	let map = $state<MLMap>();
	let maplibre: typeof import('maplibre-gl');

	const HINTS = {
		world: 'Drag to spin · click a pin to fly in',
		country: 'Click a spot to zoom in',
		spot: 'Click a pin to open that photo'
	};
	const MIXED = '#4F6158'; // cluster pin holding photos by several people
	/** night sky: [left %, top %, size px, fade-in delay ms], fixed so it's the same sky every night */
	const STARS = Array.from({ length: 34 }, (_, i) => {
		const r = (n: number) => (((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1) + 1) % 1;
		return [r(1) * 100, r(2) * 55, r(3) < 0.2 ? 2.5 : 1.5, Math.round(r(4) * 900)];
	});
	const colorOf = (id: string) => personById.get(id)?.color ?? '#D2462B';

	/** "Zach's photos" legend rows for the photographers on the open spot */
	const shooters = $derived(
		app.spot
			? [...new Set(app.gallery.map((p) => p.photographer))]
					.map((id) => personById.get(id)!)
					.filter(Boolean)
			: []
	);

	// ---------- markers ----------
	let markers: Marker[] = [];
	let photoMarkers: Marker[] = [];
	// photo id -> pin element; plain DOM bookkeeping, deliberately not reactive
	const photoPins = new Map<string, HTMLElement>(); // eslint-disable-line svelte/prefer-svelte-reactivity
	let SC: typeof Supercluster; // loaded with the map
	let cluster: Supercluster<{ id: string; n: number }> | null = null;
	let clusterPhotos: Photo[] = [];

	const add = (
		el: HTMLElement,
		lngLat: [number, number],
		anchor: 'center' | 'bottom' | 'left' | 'right' | 'top' = 'center',
		offset: [number, number] = [0, 0]
	) =>
		new maplibre.Marker({ element: el, anchor, offset, opacityWhenCovered: 0 })
			.setLngLat(lngLat)
			.addTo(map!);

	function clearMarkers() {
		markers.forEach((m) => m.remove());
		markers = [];
		clearSpotPins();
		spotsFor = null;
		clearPhotoPins();
		setRing(null);
	}
	function clearPhotoPins() {
		photoMarkers.forEach((m) => m.remove());
		photoMarkers = [];
		photoPins.clear();
	}

	function showCountryPins() {
		for (const c of app.countries) {
			const yrs = years(app.visitsOf(c).map((v) => v.start));
			const el = countryPin(c.name, yrs, app.countOf(c), !!c.label_left, () =>
				app.selectCountry(c.id)
			);
			markers.push(
				add(el, [c.lon, c.lat], c.label_left ? 'right' : 'left', [c.label_left ? 6 : -6, 0])
			);
		}
	}

	// ---- spot pins, clustered: spots closer than this on screen merge into one "N spots" pin ----
	const SPOT_OVERLAP_PX = 48; // ~ a 38px circle plus a gap; raise it to merge more eagerly
	let spotMarkers: Marker[] = [];
	let spotsFor: { cid: string; selected: string | null } | null = null;
	function clearSpotPins() {
		spotMarkers.forEach((m) => m.remove());
		spotMarkers = [];
	}

	/** Spot pins for a country at a zoom (default: the current one); re-run on every zoomend. */
	function showSpotPins(cid: string, selected: string | null, zoom = map!.getZoom()) {
		spotsFor = { cid, selected };
		clearSpotPins();
		const c = countryById.get(cid);
		if (!c) return;
		// the selected spot shows as a ring + photo pins instead
		const list = app.spotsIn(c).filter((sp) => sp.id !== selected);
		const index = new SC<{ id: string }>({ radius: SPOT_OVERLAP_PX, maxZoom: 16 }).load(
			list.map((sp) => ({
				type: 'Feature',
				properties: { id: sp.id },
				geometry: { type: 'Point', coordinates: [sp.lon, sp.lat] }
			}))
		);
		const byId = new Map(list.map((sp) => [sp.id, sp]));
		for (const f of index.getClusters([-180, -85, 180, 85], Math.round(zoom))) {
			const [lon, lat] = f.geometry.coordinates as [number, number];
			const props = f.properties as { cluster?: boolean; cluster_id?: number; id?: string };
			let el: HTMLElement;
			if (props.cluster) {
				const leaves = index
					.getLeaves(props.cluster_id!, Infinity)
					.map((l) => byId.get(l.properties.id)!);
				const n = leaves.reduce((sum, sp) => sum + app.countOf(c, sp), 0);
				el = spotClusterPin(
					leaves.map((sp) => sp.name),
					n,
					() => zoomToSpots(c, leaves)
				);
			} else {
				const sp = byId.get(props.id!)!;
				const v = app.spotVisitsOf(sp)[0];
				el = spotPin(sp.name, app.countOf(c, sp), v ? range(v.start, v.end, false) : '', () =>
					app.selectSpot(c.id, sp.id)
				);
			}
			spotMarkers.push(add(el, [lon, lat], 'top', [0, -19]));
		}
	}

	/** Room kept clear around framed spots: the breadcrumb + hint along the top, and the name
	 *  chips that hang ~60px below each circle. (No legend at country level, so the bottom is free.) */
	const clear = () =>
		container.clientWidth > 720
			? { top: 80, bottom: 75, left: 70, right: 70 }
			: { top: 70, bottom: 70, left: 36, right: 36 };

	const boundsOf = (list: { lon: number; lat: number }[]) => {
		const b = new maplibre.LngLatBounds();
		for (const sp of list) b.extend([sp.lon, sp.lat]);
		return b;
	};

	/** Cluster clicked: remember it as an area (a breadcrumb level), then frame its spots so their
	 *  pins have room to separate. Named after its biggest spot: "Amagasaki area". */
	function zoomToSpots(c: Country, list: Spot[]) {
		const top = [...list].sort((a, b) => app.countOf(c, b) - app.countOf(c, a))[0];
		app.enterArea(
			`${top.name} area`,
			list.map((sp) => sp.id)
		);
		cam.flyTo(map!, placeView(c), 1.2, 1200);
	}

	/** Landing view for a country, or for the remembered area inside it: fit the (filtered) spots
	 *  inside the clear part of the map, not under the overlays. */
	function placeView(c: Country) {
		const inArea = app.area?.country === c.id ? app.area.spots : null;
		const spots = app.spotsIn(c).filter((sp) => !inArea || inArea.includes(sp.id));
		const fit = spots.length
			? map!.cameraForBounds(boundsOf(spots), { padding: clear(), maxZoom: inArea ? 13 : 9 })
			: undefined;
		const center = fit?.center ? maplibre.LngLat.convert(fit.center) : null;
		if (!center) return { lon: c.lon, lat: c.lat, zoom: cam.countryZoom(c.zoom) };
		const zoom = fit!.zoom ?? c.zoom;
		return {
			lon: center.lng,
			lat: center.lat,
			zoom: inArea ? Math.min(13, zoom) : cam.countryZoom(zoom)
		};
	}

	function setRing(spot: { c: string; s: string } | null) {
		const src = map?.getSource('ring') as GeoJSONSource | undefined;
		const s = spot && getSpot(spot.c, spot.s);
		const ring = s ? circle(s.lon, s.lat, s.radius_km * 1.25) : null;
		src?.setData({
			type: 'FeatureCollection',
			features: ring
				? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: ring } }]
				: []
		});
		if (s) {
			const trips = app.spotVisitsOf(s);
			const when =
				trips.length === 1 ? range(trips[0].start, trips[0].end) : plural(trips.length, 'trip');
			const n = app.countOf(countryById.get(s.country)!, s);
			const top = circle(s.lon, s.lat, s.radius_km * 1.25, 4)[1];
			markers.push(
				add(ringLabel(`${s.name} · ${when} · ${plural(n, 'photo')}`), top, 'bottom', [0, -6])
			);
		}
	}

	/** Photos within ~a mile share one marker (groupNearby); markers that still overlap on screen
	 *  (e.g. after zooming out by hand) merge again by pixel distance. */
	let groups: Group<Photo & { n: number }>[] = [];
	async function loadCluster() {
		groups = groupNearby(clusterPhotos.map((p, i) => ({ ...p, n: i + 1 })));
		cluster = new SC({ radius: 40, maxZoom: 17 });
		cluster.load(
			groups.map((g, gi) => ({
				type: 'Feature',
				properties: { id: `${gi}`, n: g.items.length },
				geometry: { type: 'Point', coordinates: [g.lon, g.lat] }
			}))
		);
	}

	/** Photo markers for the selected spot at the current zoom. `drop` animates them in. */
	function renderPhotoPins(drop: boolean) {
		clearPhotoPins();
		if (!cluster || !map) return;
		const items = cluster.getClusters([-180, -85, 180, 85], Math.floor(map.getZoom()));
		items.forEach((f, i) => {
			const [lon, lat] = f.geometry.coordinates as [number, number];
			const delay = drop && !cam.reducedMotion() ? i : null;
			const props = f.properties as { cluster?: boolean; cluster_id?: number; id?: string };
			const merged = props.cluster
				? cluster!.getLeaves(props.cluster_id!, Infinity).map((l) => groups[+l.properties.id])
				: [groups[+props.id!]];
			const photos = merged.flatMap((g) => g.items);
			const who = new Set(photos.map((p) => p.photographer));
			const color = who.size === 1 ? colorOf(photos[0].photographer) : MIXED;
			let el: HTMLElement;
			if (photos.length === 1) {
				const p = photos[0];
				el = photoPin(
					p.n,
					`Photo ${p.n} by ${personName(p.photographer)}`,
					`PHOTO ${p.n} · ${coord(lat, lon)}`,
					color,
					delay,
					() => app.openPhoto(p.id)
				);
			} else {
				const n = photos.length;
				el = photoPin(
					n,
					`${n} photos taken here, by ${[...who].map(personName).join(', ')}. Open them.`,
					`${n} PHOTOS · ${coord(lat, lon)}`,
					color,
					delay,
					() => {
						// groups merged only because we're zoomed out: zoom in until they separate;
						// a single group (all within ~a mile): open its photos in the lightbox
						if (props.cluster) {
							const zoom = cluster!.getClusterExpansionZoom(props.cluster_id!);
							if (zoom <= 17) return void cam.flyTo(map!, { lon, lat, zoom }, 1.2, 800);
						}
						app.openPhoto(photos[0].id);
					}
				);
				el.classList.add('cluster');
			}
			for (const p of photos) photoPins.set(p.id, el);
			photoMarkers.push(add(el, [lon, lat], 'bottom'));
		});
		highlight(app.nav.p);
	}

	function highlight(p: string | null) {
		for (const [id, el] of photoPins) el.classList.toggle('open', id === p);
	}

	// ---------- navigation -> camera + markers ----------
	type Place = { c: string | null; s: string | null; filter: string };
	let prev: Place | null = null;
	let gen = 0;

	async function navigate(n: Place) {
		const from = prev;
		prev = n;
		const g = ++gen;
		const moved = !from || from.c !== n.c || from.s !== n.s; // false = only the filters changed
		clearMarkers();
		cluster = null;
		const c = n.c ? countryById.get(n.c) : undefined;
		const s = getSpot(n.c, n.s);

		map!.removeFeatureState({ source: 'visited' });
		if (c) map!.setFeatureState({ source: 'visited', id: c.id }, { selected: true });

		if (!c) {
			showCountryPins();
			lastInteraction = 0; // back at World: resume spinning straight away
			if (moved && from) await cam.home(map!);
			return;
		}
		for (const sp of app.spotsIn(c)) prefetch(map!, sp.lon, sp.lat, cam.spotZoom(sp.zoom));
		// cluster for the zoom we're about to land on, so pins don't merge then split mid-dive
		showSpotPins(c.id, n.s, s ? cam.spotZoom(s.zoom) : placeView(c).zoom);
		if (!s) {
			const t = placeView(c);
			if (!moved) return;
			if (!from) await cam.jump(map!, t);
			else if (!from.c) await cam.spinIn(map!, t);
			else await cam.flyTo(map!, t);
			return;
		}
		setRing({ c: c.id, s: s.id });
		clusterPhotos = app.gallery;
		const t = { lon: s.lon, lat: s.lat, zoom: cam.spotZoom(s.zoom) };
		const sibling = !!(from?.s && from.c === n.c && from.s !== n.s);
		if (!from) await cam.jump(map!, t);
		else if (moved) await cam.flyTo(map!, t, sibling ? 1.8 : 1.2);
		await loadCluster();
		if (g === gen) renderPhotoPins(moved);
	}

	$effect(() => {
		const n = {
			c: app.nav.c,
			s: app.nav.s,
			filter: `${app.nav.by}|${app.nav.who}|${app.nav.trip}`
		};
		if (!map) return;
		untrack(() => {
			if (prev && prev.c === n.c && prev.s === n.s && prev.filter === n.filter) return;
			navigate(n);
		});
	});

	$effect(() => highlight(app.nav.p));

	// ---------- World clicked while already at World: fly home from wherever we drifted ----------
	$effect(() => {
		if (!app.homeTick || !map) return;
		untrack(() => {
			lastInteraction = 0;
			cam.home(map!);
		});
	});

	// ---------- the current place clicked again: fly back to its own view ----------
	$effect(() => {
		if (!app.refocusTick || !map) return;
		untrack(() => {
			const c = app.country;
			const s = app.spot;
			if (!c) return;
			if (s) cam.flyTo(map!, { lon: s.lon, lat: s.lat, zoom: cam.spotZoom(s.zoom) }, 1.2, 1200);
			else cam.flyTo(map!, placeView(c), 1.42, 1200);
		});
	});

	// ---------- day <-> night: repaint the map in step with the sky (tokens.css timings) ----------
	let appliedDark = false;
	$effect(() => {
		const dark = theme.dark;
		if (!map || dark === appliedDark) return;
		appliedDark = dark;
		const m = map;
		setTimeout(() => applyTheme(m, dark), dark ? 300 : 200);
	});

	// ---------- trips (Phase 6): markers at World level, fly-to from banner/list/marker ----------
	let tripMarkers: Marker[] = [];
	function renderTrips() {
		tripMarkers.forEach((m) => m.remove());
		tripMarkers = [];
		if (app.level !== 'world') return;
		const show = [
			...(app.live ? [{ kind: 'live' as const, t: app.live }] : []),
			...app.upcoming.map((t) => ({ kind: 'upcoming' as const, t }))
		];
		for (const { kind, t } of show) {
			const label =
				kind === 'live' ? `Here now · ${shortName(t)}` : `${monthDay(t.start)} · ${shortName(t)}`;
			const aria =
				kind === 'live'
					? `Here now: ${t.name}`
					: `Upcoming trip: ${t.name}, ${range(t.start, t.end)}`;
			const el = tripPin(kind, label, aria, () => app.showTrip(t));
			tripMarkers.push(add(el, displayPoint(t), 'left', [-9, 0]));
		}
	}
	$effect(() => {
		void [app.level, app.live, app.upcoming];
		if (map) untrack(renderTrips);
	});

	$effect(() => {
		const t = app.focusTrip;
		if (!t || !map) return;
		untrack(() => {
			const [lon, lat] = displayPoint(t);
			lastInteraction = Infinity; // stay on the trip until the user touches the globe or goes to World
			// next tick: after any zoom-out that going back to World just started
			setTimeout(() => cam.flyTo(map!, { lon, lat, zoom: 2.5 }, 1.42, 2000));
		});
	});

	// ---------- auto-spin (World level, idle 4 s) ----------
	const SPIN_DEG_PER_S = 9;
	let lastInteraction = 0;
	// a pointer held on the globe: never auto-spin then, since jumpTo would cancel the user's drag
	let held = false;
	// off-screen (scrolled to the gallery) or under the photo viewer: don't redraw the globe every frame
	let onScreen = true;
	function spin() {
		new IntersectionObserver(([e]) => (onScreen = e.isIntersecting)).observe(container);
		let last = performance.now();
		const frame = (now: number) => {
			if (!map) return;
			const dt = (now - last) / 1000;
			last = now;
			if (
				app.level === 'world' &&
				onScreen &&
				!app.nav.p &&
				!cam.reducedMotion() &&
				!held &&
				now - lastInteraction > 4000 &&
				!map.isMoving() &&
				map.getZoom() < 3
			) {
				const c = map.getCenter();
				map.jumpTo({ center: [c.lng + SPIN_DEG_PER_S * dt, c.lat] });
			}
			requestAnimationFrame(frame);
		};
		requestAnimationFrame(frame);
	}

	onMount(() => {
		let disposed = false;
		(async () => {
			const [ml, style, , worker, sc] = await Promise.all([
				import('maplibre-gl'),
				buildStyle(document.documentElement.dataset.theme === 'dark').catch(
					() =>
						({
							version: 8,
							projection: { type: 'globe' },
							sources: {},
							layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#EEF2EC' } }]
						}) as never
				),
				import('maplibre-gl/dist/maplibre-gl.css'),
				// v6 loads its worker from a separate module; let Vite bundle it and pass the URL
				import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'),
				import('supercluster')
			]);
			SC = sc.default;
			if (disposed) return;
			appliedDark = document.documentElement.dataset.theme === 'dark';
			maplibre = ml;
			ml.setWorkerUrl(worker.default);
			const m = new ml.Map({
				container,
				style,
				center: cam.WORLD_CENTER,
				zoom: cam.worldZoom(container),
				minZoom: 0.6,
				maxZoom: 17,
				dragRotate: false,
				pitchWithRotate: false,
				touchPitch: false,
				attributionControl: { compact: true },
				// smoother dives: let tiles requested mid-flight finish (instead of cancelling and
				// re-requesting them), and keep more zoom levels in memory for zooming back out
				cancelPendingTileRequestsWhileZooming: false,
				maxTileCacheZoomLevels: 10,
				pixelRatio: Math.min(devicePixelRatio, 2)
			});
			m.touchZoomRotate.disableRotation();
			m.keyboard.disableRotation();
			m.getCanvas().setAttribute(
				'aria-label',
				'Interactive globe of photo locations. Drag to spin it, or click a pin to fly in. The destination list beside it does the same.'
			);
			for (const ev of ['mousedown', 'touchstart', 'wheel', 'dragend'] as const)
				m.on(ev, () => (lastInteraction = performance.now()));
			m.on('dragstart', () => cam.stop(m, true));
			container.addEventListener('pointerdown', () => (held = true));
			addEventListener('pointerup', () => {
				if (!held) return; // clicks elsewhere on the page (e.g. the World button) don't pause the spin
				held = false;
				lastInteraction = performance.now();
			});
			m.on('zoomend', () => {
				if (m.isMoving()) return;
				if (spotsFor) showSpotPins(spotsFor.cid, spotsFor.selected);
				if (cluster) renderPhotoPins(false);
			});
			m.on('load', () => {
				const below = m.getLayer('boundary_3') ? 'boundary_3' : undefined;
				const P = palette(appliedDark);
				m.addSource('visited', {
					type: 'geojson',
					data: new URL(visitedUrl, location.href).href,
					promoteId: 'id'
				});
				m.addLayer(
					{
						id: 'visited-fill',
						type: 'fill',
						source: 'visited',
						paint: {
							...colorsFor({ id: 'visited-fill', type: 'fill' }, P),
							'fill-color-transition': { duration: 300, delay: 0 }, // selection stays snappy
							// a country-scale tint; fade it out before street level
							'fill-opacity': ['interpolate', ['linear'], ['zoom'], 8, 1, 11, 0]
						}
					},
					below
				);
				if (below) addContours(m, ml, below, P);
				m.addSource('ring', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
				m.addLayer({
					id: 'ring',
					type: 'line',
					source: 'ring',
					paint: {
						...colorsFor({ id: 'ring', type: 'line' }, P),
						'line-width': 1.5,
						'line-dasharray': [3, 2]
					}
				});
				map = m;
				spin();
				// keep the map credit collapsed behind its (i) button until someone clicks it
				const collapse = () =>
					container
						.querySelector('.maplibregl-ctrl-attrib')
						?.classList.remove('maplibregl-compact-show');
				collapse();
				m.once('idle', collapse);
				// warm the cache for every country's landing view while the globe idles
				m.once('idle', () => {
					for (const c of app.countries) prefetch(m, c.lon, c.lat, cam.countryZoom(c.zoom));
				});
			});
		})();
		return () => {
			disposed = true;
			map?.remove();
			map = undefined;
		};
	});
</script>

<div class="stage">
	<!-- sky: stars and moon wait below/behind; night mode lifts them as the sun sets (CSS only) -->
	<div class="stars" aria-hidden="true">
		{#each STARS as st, i (i)}
			<i style:left="{st[0]}%" style:top="{st[1]}%" style:--s="{st[2]}px" style:--d="{st[3]}ms"></i>
		{/each}
	</div>
	<div class="sun" aria-hidden="true"></div>
	<div class="moon" aria-hidden="true"></div>
	<svg class="ridges" aria-hidden="true" viewBox="0 0 1200 300" preserveAspectRatio="none">
		<path
			fill="var(--ridge-1)"
			d="M0 300 L0 133 L13 141 L27 143 L40 132 L54 140 L67 144 L81 139 L94 144 L108 148 L121 150 L135 150 L148 155 L162 149 L175 147 L189 143 L202 148 L216 149 L229 146 L243 139 L256 137 L270 137 L283 134 L297 146 L310 155 L324 131 L337 114 L351 112 L364 108 L378 110 L391 112 L404 131 L418 121 L431 118 L445 136 L458 142 L472 148 L485 143 L499 129 L512 130 L526 131 L539 120 L553 114 L566 113 L580 105 L593 104 L607 105 L620 105 L634 100 L647 106 L661 114 L674 117 L688 109 L701 116 L715 111 L728 119 L742 110 L755 118 L769 118 L782 106 L796 104 L809 104 L822 107 L836 98 L849 88 L863 90 L876 85 L890 87 L903 94 L917 79 L930 82 L944 93 L957 90 L971 83 L984 90 L998 92 L1011 100 L1025 97 L1038 83 L1052 82 L1065 78 L1079 85 L1092 87 L1106 73 L1119 62 L1133 70 L1146 76 L1160 70 L1173 70 L1187 74 L1200 78 L1200 300 Z"
		/>
		<path
			fill="var(--ridge-2)"
			d="M0 300 L0 187 L13 182 L27 178 L40 153 L54 171 L67 183 L81 179 L94 187 L108 190 L121 184 L135 194 L148 191 L162 188 L175 180 L189 184 L202 183 L216 189 L229 183 L243 184 L256 175 L270 183 L283 185 L297 189 L310 193 L324 183 L337 190 L351 211 L364 195 L378 177 L391 162 L404 171 L418 172 L431 183 L445 190 L458 192 L472 195 L485 193 L499 202 L512 191 L526 186 L539 189 L553 207 L566 199 L580 188 L593 183 L607 193 L620 190 L634 203 L647 185 L661 196 L674 206 L688 192 L701 194 L715 206 L728 207 L742 213 L755 213 L769 213 L782 210 L796 202 L809 209 L822 207 L836 205 L849 204 L863 211 L876 200 L890 185 L903 160 L917 172 L930 173 L944 188 L957 188 L971 181 L984 185 L998 185 L1011 172 L1025 163 L1038 181 L1052 185 L1065 189 L1079 186 L1092 179 L1106 188 L1119 187 L1133 179 L1146 178 L1160 169 L1173 171 L1187 182 L1200 174 L1200 300 Z"
		/>
		<path
			fill="var(--ridge-3)"
			d="M0 300 L0 251 L13 231 L27 234 L40 230 L54 226 L67 224 L81 208 L94 206 L108 199 L121 226 L135 228 L148 225 L162 223 L175 217 L189 209 L202 206 L216 210 L229 208 L243 215 L256 214 L270 214 L283 226 L297 231 L310 227 L324 225 L337 230 L351 245 L364 243 L378 241 L391 249 L404 242 L418 240 L431 247 L445 251 L458 252 L472 255 L485 232 L499 241 L512 233 L526 220 L539 222 L553 227 L566 224 L580 215 L593 215 L607 215 L620 226 L634 232 L647 234 L661 243 L674 241 L688 234 L701 238 L715 243 L728 241 L742 235 L755 237 L769 217 L782 222 L796 226 L809 213 L822 214 L836 206 L849 212 L863 196 L876 188 L890 194 L903 203 L917 186 L930 185 L944 188 L957 185 L971 198 L984 188 L998 191 L1011 185 L1025 196 L1038 196 L1052 193 L1065 185 L1079 198 L1092 204 L1106 211 L1119 220 L1133 222 L1146 217 L1160 211 L1173 204 L1187 215 L1200 204 L1200 300 Z"
		/>
	</svg>
	{#if !map}<div class="placeholder" aria-hidden="true"></div>{/if}
	<div class="map" bind:this={container}></div>

	<nav class="crumbs glass mono" aria-label="Breadcrumb">
		<button onclick={app.world} aria-current={app.level === 'world' ? 'location' : undefined}
			>World</button
		>
		{#if app.country}
			<span aria-hidden="true">/</span>
			<button
				onclick={() => app.selectCountry(app.country!.id)}
				aria-current={app.level === 'country' && !app.area ? 'location' : undefined}
				>{app.country.name}</button
			>
		{/if}
		{#if app.area && app.area.country === app.country?.id}
			<span aria-hidden="true">/</span>
			<button
				onclick={app.selectArea}
				aria-current={app.level === 'country' ? 'location' : undefined}>{app.area.name}</button
			>
		{/if}
		{#if app.spot}
			<span aria-hidden="true">/</span>
			<button
				onclick={() => app.selectSpot(app.country!.id, app.spot!.id)}
				aria-current="location"
				title="Back to {app.spot.name}">{app.spot.name}</button
			>
		{/if}
	</nav>

	<!-- legend only where it explains something on screen: trip markers at World,
	     photographers' pin colors at a spot. Hidden at country level to keep the map clear. -->
	{#if app.level === 'world'}
		<div class="legend glass" aria-label="Map legend">
			<span><i class="live"></i>Here now</span>
			<span><i class="upcoming"></i>Upcoming trip</span>
			<span><i class="visited"></i>Visited</span>
		</div>
	{:else if app.level === 'spot' && shooters.length}
		<div class="legend glass" aria-label="Map legend">
			{#each shooters as p (p.id)}
				<span><i class="shooter" style:background={p.color}></i>{p.name}'s photos</span>
			{/each}
		</div>
	{/if}
	<div class="hint glass mono">{HINTS[app.level]}</div>
</div>

<style>
	.stage {
		position: relative;
		flex: 999 1 620px;
		min-width: 0;
		height: var(--stage-h); /* set on the globe section in +page.svelte */
		overflow: hidden;
	}
	/* ---- day <-> night (timings line up with tokens.css: sky 300ms+1.6s at dusk, 200ms at dawn) ---- */
	.sun {
		position: absolute;
		right: 12%;
		top: 70px;
		width: 160px;
		height: 160px;
		border-radius: 50%;
		background: var(--sun);
		opacity: 0.9;
		/* dawn: rises on the reverse of its setting path, decelerating as it arrives */
		transition: transform 1600ms var(--ease-out) 200ms;
	}
	:global([data-theme='dark']) .sun {
		/* dusk: sinks behind the ridges along a slight arc, accelerating like a real sunset */
		transform: translate(70px, 560px); /* fully below the stage edge */
		transition: transform 1600ms var(--ease-in) 300ms;
	}
	.moon {
		position: absolute;
		left: 14%;
		top: 60px;
		width: 92px;
		height: 92px;
		border-radius: 50%;
		box-shadow: inset -22px 10px 0 0 #e9e4c8; /* crescent */
		filter: drop-shadow(0 0 22px rgba(233, 228, 200, 0.35));
		transform: translate(-40px, 380px);
		opacity: 0;
		/* dawn: the moon sets first, then the sun comes up */
		transition:
			transform 1200ms var(--ease-in),
			opacity 500ms linear 700ms;
	}
	:global([data-theme='dark']) .moon {
		transform: none;
		opacity: 1;
		/* dusk: rises once the sun is nearly down */
		transition:
			transform 1700ms var(--ease-out) 1100ms,
			opacity 600ms linear 1100ms;
	}
	.stars {
		position: absolute;
		inset: 0;
	}
	.stars i {
		position: absolute;
		width: var(--s);
		height: var(--s);
		border-radius: 50%;
		background: #f4f1df;
		opacity: 0;
		transition: opacity 300ms linear;
	}
	:global([data-theme='dark']) .stars i {
		opacity: 0.85;
		/* they come out one by one after the moon is up; no twinkle loop (calm, vestibular-safe) */
		transition: opacity 900ms linear calc(1700ms + var(--d));
	}
	.ridges {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		width: 100%;
		height: 300px;
	}
	.placeholder {
		position: absolute;
		left: 50%;
		top: 50%;
		width: min(480px, 75%);
		aspect-ratio: 1;
		translate: -50% -50%;
		border-radius: 50%;
		background: radial-gradient(circle at 35% 35%, var(--surface), var(--line));
		box-shadow: 0 0 0 1px var(--line);
	}
	.map {
		position: absolute;
		inset: 0;
	}
	.glass {
		position: absolute;
		background: var(--surface-glass);
		border: 1px solid var(--line);
	}
	.crumbs {
		left: 16px;
		top: 16px;
		display: flex;
		align-items: center;
		gap: 2px;
		padding: 4px;
		border-radius: 10px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-size: 12px;
		color: var(--muted);
	}
	.crumbs button {
		min-height: 40px;
		padding: 0 12px;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--muted);
		text-transform: inherit;
		letter-spacing: inherit;
	}
	.crumbs [aria-current] {
		color: var(--ink);
	}
	.crumbs > span[aria-hidden] {
		color: var(--faint);
	}
	.legend {
		left: 16px;
		bottom: 64px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 10px 12px;
		border-radius: 10px;
		font-size: 12px;
	}
	.legend span {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.legend i {
		width: 10px;
		height: 10px;
		border-radius: 50%;
	}
	.legend .live {
		position: relative;
		background: var(--live);
		border: 2px solid #fff;
		box-shadow: 0 0 0 1px rgba(30, 158, 104, 0.4);
	}
	/* pulsing ring: someone is out there right now */
	.legend .live::after {
		content: '';
		position: absolute;
		inset: -2px;
		border-radius: 50%;
		background: var(--live);
		animation: trip-pulse 1.8s ease-out infinite;
	}
	.legend .upcoming {
		border: 2.5px solid var(--upcoming);
	}
	.legend .shooter {
		border-radius: 50% 50% 50% 0;
		rotate: -45deg;
	}
	.legend .visited {
		background: var(--sunrise);
	}
	/* top-right, level with the breadcrumb, so the bottom of the map stays free for pins */
	.hint {
		top: 23px;
		right: 16px;
		padding: 8px 14px;
		border-radius: var(--radius-pill);
		font-size: 11px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--muted);
		white-space: nowrap;
		pointer-events: none;
	}
	@media (max-width: 720px) {
		.legend,
		.hint {
			display: none; /* small screens: the map needs the room; pins are self-explanatory */
		}
	}

	/* ---- map internals ---- */
	.map :global(.maplibregl-canvas) {
		outline: none;
	}
	.map :global(.maplibregl-canvas:focus-visible) {
		outline: 2px solid var(--pine);
		outline-offset: -2px;
	}
	.map :global(.maplibregl-marker-covered) {
		visibility: hidden;
		pointer-events: none;
	}
	.map :global(button[class^='pin-']) {
		display: flex;
		align-items: center;
		padding: 0;
		border: 0;
		background: none;
	}
	.map :global(.chip),
	.map :global(.pin-ring-label) {
		padding: 3px 8px;
		border-radius: 6px;
		background: var(--surface-glass);
		border: 1px solid rgba(23, 35, 29, 0.18);
		white-space: nowrap;
		color: var(--ink);
	}

	/* country pin: sunrise dot with a soft pulsing ring + mono label */
	.map :global(.pin-country) {
		gap: 8px;
	}
	.map :global(.pin-country.left) {
		flex-direction: row-reverse;
	}
	.map :global(.pin-country .dot) {
		position: relative;
		width: 11px;
		height: 11px;
		border-radius: 50%;
		background: var(--sunrise);
		box-shadow: 0 0 0 2px #fff;
	}
	.map :global(.pin-country .dot::after) {
		content: '';
		position: absolute;
		inset: -5px;
		border-radius: 50%;
		background: rgba(180, 85, 26, 0.25);
		animation: pin-pulse 2.4s ease-out infinite;
	}
	.map :global(.pin-country .chip) {
		font: 500 11px var(--font-mono);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.map :global(.pin-country .chip b) {
		font-weight: 500;
		color: var(--sunrise);
	}
	.map :global(.pin-country:hover .chip) {
		border-color: var(--sunrise);
	}

	/* spot pin: 38px circle with count + name chip under it */
	.map :global(.pin-spot) {
		flex-direction: column;
		gap: 4px;
	}
	.map :global(.pin-spot .circle) {
		display: grid;
		place-items: center;
		width: 38px;
		height: 38px;
		border-radius: 50%;
		border: 2px solid var(--pine);
		background: var(--surface);
		font: 500 13px var(--font-mono);
		color: var(--pine);
		box-shadow: 0 2px 8px rgba(23, 35, 29, 0.15);
		transition: background 120ms;
	}
	.map :global(.pin-spot:hover .circle) {
		background: var(--pine-tint);
	}
	.map :global(.pin-spot .chip) {
		display: flex;
		flex-direction: column;
		align-items: center;
		font: 600 13px var(--font-body);
	}
	/* several spots merged: one circle with their combined photo count */
	.map :global(.pin-spot.cluster .circle) {
		font-weight: 600;
	}
	.map :global(.pin-spot.cluster .chip) {
		font: 500 11px var(--font-mono);
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.map :global(.pin-spot.cluster .chip small) {
		text-transform: none;
		letter-spacing: 0;
		font-family: var(--font-body);
		font-size: 11px;
	}
	.map :global(.pin-spot .chip small) {
		font: 500 10px var(--font-mono);
		color: var(--muted);
		letter-spacing: 0.04em;
	}

	/* photo pin: teardrop, tip on the coordinate */
	.map :global(.pin-photo .drop) {
		position: relative;
		display: block;
		width: 26px;
		height: 36px;
	}
	.map :global(.pin-photo.dropping .drop) {
		animation: pin-drop 420ms var(--ease-out) both;
		animation-delay: calc(var(--i) * 90ms);
	}
	.map :global(.pin-photo svg) {
		display: block;
		width: 26px;
		height: 36px;
		fill: var(--pin, var(--pin-photo));
		stroke: rgba(23, 35, 29, 0.35);
		stroke-width: 1.2;
		filter: drop-shadow(0 2px 3px rgba(23, 35, 29, 0.3));
		transition: filter 120ms;
	}
	.map :global(.pin-photo:hover svg),
	.map :global(.pin-photo:focus-visible svg) {
		filter: drop-shadow(0 2px 3px rgba(23, 35, 29, 0.3)) brightness(1.18);
	}
	/* open photo: sunrise outline (fill is the photographer's color) */
	.map :global(.pin-photo.open svg path) {
		stroke: var(--sunrise);
		stroke-width: 2.5;
	}
	.map :global(.pin-photo .num) {
		position: absolute;
		left: 0;
		top: 4px;
		width: 26px;
		text-align: center;
		font: 600 10px/17px var(--font-mono);
		color: var(--ink);
	}
	.map :global(.pin-photo .tip) {
		position: absolute;
		left: 50%;
		bottom: 40px;
		translate: -50% 0;
		padding: 3px 8px;
		border-radius: 6px;
		background: var(--surface-glass);
		border: 1px solid rgba(23, 35, 29, 0.18);
		font: 500 11px var(--font-mono);
		letter-spacing: 0.06em;
		white-space: nowrap;
		color: var(--ink);
		opacity: 0;
		pointer-events: none;
		transition: opacity 120ms;
	}
	.map :global(.pin-photo:hover .tip),
	.map :global(.pin-photo:focus-visible .tip) {
		opacity: 1;
	}
	.map :global(.pin-ring-label) {
		font: 500 11px var(--font-mono);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--pine);
	}

	/* trip markers: dot on the coordinate + mono chip */
	.map :global(.pin-trip) {
		gap: 8px;
	}
	.map :global(.pin-trip .mark) {
		position: relative;
		width: 18px;
		height: 18px;
		flex: none;
	}
	.map :global(.pin-trip.live .mark::before) {
		content: '';
		position: absolute;
		inset: 3px;
		z-index: 1;
		border-radius: 50%;
		background: var(--live);
		border: 2px solid #fff;
		box-shadow: 0 1px 4px rgba(23, 35, 29, 0.3);
	}
	.map :global(.pin-trip.live .mark i) {
		position: absolute;
		inset: 3px;
		border-radius: 50%;
		background: var(--live);
		animation: trip-pulse 1.8s ease-out infinite;
	}
	.map :global(.pin-trip.live .mark i + i) {
		animation-delay: 0.9s;
	}
	.map :global(.pin-trip.upcoming .mark::before) {
		content: '';
		position: absolute;
		inset: 3px;
		border-radius: 50%;
		border: 2.5px solid var(--upcoming);
		background: var(--card);
	}
	.map :global(.pin-trip.upcoming .mark::after) {
		content: '';
		position: absolute;
		inset: -3px;
		border-radius: 50%;
		border: 1.5px dashed var(--upcoming-line);
	}
	.map :global(.pin-trip.upcoming .mark i) {
		display: none;
	}
	.map :global(.pin-trip .chip) {
		font: 500 11px var(--font-mono);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.map :global(.pin-trip.live .chip) {
		color: var(--live-ink);
		border-color: var(--live-line);
		background: var(--live-soft);
	}
	.map :global(.pin-trip.upcoming .chip) {
		color: var(--upcoming);
	}

	@keyframes -global-trip-pulse {
		from {
			transform: scale(1);
			opacity: 0.6;
		}
		to {
			transform: scale(2.8);
			opacity: 0;
		}
	}
	@keyframes -global-pin-pulse {
		0% {
			transform: scale(0.6);
			opacity: 0.9;
		}
		100% {
			transform: scale(2);
			opacity: 0;
		}
	}
	@keyframes -global-pin-drop {
		from {
			transform: translateY(-60px);
			opacity: 0;
		}
		to {
			transform: none;
			opacity: 1;
		}
	}
</style>
