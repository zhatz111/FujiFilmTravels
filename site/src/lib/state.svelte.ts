// App state. The URL is the source of truth: actions push/replace history entries, and
// syncFromUrl() (run by +page.svelte on load and popstate) updates `nav`.
// Everything the page shows (pins, counts, panels, gallery, lightbox) reads the *filtered* views here.
import { goto } from '$app/navigation';
import {
	countries,
	countryById,
	getSpot,
	personById,
	photoById,
	photos,
	spotsOf,
	trips,
	visitById,
	visits
} from './data';
import { liveTrip, upcomingTrips } from './trips';
import type { Country, Level, Nav, Photo, Spot, Trip } from './types';
import { EMPTY, levelOf, navToSearch, parseNav, sanitize, visitFilter, type Lookup } from './url';

const KEYS = ['c', 's', 'p', 'who', 'trip'] as const;

const lookup: Lookup = {
	person: (id) => personById.has(id),
	visit: (id) => visitById.get(id),
	countryVisits: (c) => countryById.get(c)?.visits.map((v) => v.id),
	spotVisits: (c, s) => getSpot(c, s)?.visits.map((v) => v.visit),
	photo: (p) => photoById.get(p)
};

const byTripThenTime = (a: Photo, b: Photo) =>
	(visitById.get(b.visit)?.start ?? '').localeCompare(visitById.get(a.visit)?.start ?? '') ||
	a.taken.localeCompare(b.taken);

class AppState {
	nav = $state<Nav>({ ...EMPTY });
	/** true while the lightbox entry is one we pushed, so closing can go back instead of stacking */
	pushedPhoto = false;

	level: Level = $derived(levelOf(this.nav));
	country = $derived(this.nav.c ? countryById.get(this.nav.c) : undefined);
	spot = $derived(getSpot(this.nav.c, this.nav.s));
	photo = $derived(this.nav.p ? photoById.get(this.nav.p) : undefined);
	filtering = $derived(!!(this.nav.who || this.nav.trip));

	// ---- filtered views ----
	/** does a visit (trip) pass the Traveler + Trip filters */
	ok = $derived(visitFilter(this.nav, lookup));
	shown = $derived(photos.filter((p) => this.ok(p.visit)));
	private counts = $derived.by(() => {
		const m = new Map<string, number>(); // eslint-disable-line svelte/prefer-svelte-reactivity -- rebuilt on each derive
		for (const p of this.shown) {
			m.set(p.country, (m.get(p.country) ?? 0) + 1);
			m.set(`${p.country}/${p.spot}`, (m.get(`${p.country}/${p.spot}`) ?? 0) + 1);
		}
		return m;
	});
	countOf = (c: Country, s?: Spot) => this.counts.get(s ? `${c.id}/${s.id}` : c.id) ?? 0;
	countries = $derived(countries.filter((c) => this.countOf(c) > 0));
	spotsIn = (c: Country) => spotsOf(c).filter((s) => this.countOf(c, s) > 0);
	visitsOf = (c: Country) => c.visits.filter((v) => this.ok(v.id));
	spotVisitsOf = (s: Spot) => s.visits.filter((v) => this.ok(v.visit));

	/** what the gallery shows and lightbox prev/next walks: newest trip first, then time taken */
	gallery = $derived.by(() => {
		if (!this.country) return [];
		const c = this.country.id;
		const s = this.spot?.id;
		return this.shown.filter((p) => p.country === c && (!s || p.spot === s)).sort(byTripThenTime);
	});

	/** Trip dropdown: trips matching the Traveler, limited to the current place, newest first */
	tripOptions = $derived.by(() => {
		const here = this.spot
			? new Set(this.spot.visits.map((v) => v.visit))
			: this.country
				? new Set(this.country.visits.map((v) => v.id))
				: null;
		const who = this.nav.who;
		return visits.filter((v) => (!here || here.has(v.id)) && (!who || v.companions.includes(who)));
	});

	/** photos + trips in the current scope, for the filter bar's result line */
	scope = $derived.by(() => {
		const list = this.country ? this.gallery : this.shown;
		return { photos: list.length, trips: new Set(list.map((p) => p.visit)).size };
	});

	// ---- trips: decided in the browser only, so the prerendered HTML never bakes in a status ----
	now = $state<Date | null>(null);
	live = $derived(this.now ? liveTrip(trips, this.now) : undefined);
	upcoming = $derived(this.now ? upcomingTrips(trips, this.now) : []);
	/** the trip the globe should fly to (a fresh object each time, so repeat clicks re-fly) */
	focusTrip = $state<Trip | null>(null);

	/** start the clock after hydration; re-evaluate trip status every 10 minutes */
	startClock() {
		this.now = new Date();
		const id = setInterval(() => (this.now = new Date()), 10 * 60_000);
		return () => clearInterval(id);
	}

	/** Trip marker / banner / list: from any level, go to World and fly to the trip. */
	showTrip = (t: Trip) => {
		if (this.level !== 'world') this.world();
		this.focusTrip = { ...t };
	};

	syncFromUrl(search: string) {
		const n = sanitize(parseNav(search), lookup);
		if (KEYS.some((k) => n[k] !== this.nav[k])) this.nav = n;
		if (!n.p) this.pushedPhoto = false;
	}

	private go(next: Nav, mode: 'push' | 'replace' = 'push') {
		next = sanitize(next, lookup);
		const url = location.pathname + navToSearch(next) + location.hash;
		goto(url, { shallow: true, replace: mode === 'replace' }); // shallow: no scroll/focus reset
		this.nav = next;
	}

	/** bumped when World is clicked while already at World, so the globe still flies home */
	homeTick = $state(0);
	world = () => {
		if (this.level === 'world') this.homeTick++;
		else this.go({ ...this.nav, c: null, s: null, p: null });
	};
	selectCountry = (c: string) => this.go({ ...this.nav, c, s: null, p: null });
	selectSpot = (c: string, s: string) => this.go({ ...this.nav, c, s, p: null });
	up = () => (this.nav.s ? this.selectCountry(this.nav.c!) : this.world());

	/** Changing Traveler resets Trip. */
	setWho = (who: string | null) => this.go({ ...this.nav, who, trip: null, p: null });
	setTrip = (trip: string | null) => this.go({ ...this.nav, trip, p: null });
	clearFilters = () => this.go({ ...this.nav, who: null, trip: null });

	openPhoto = (p: string) => {
		const ph = photoById.get(p);
		if (!ph) return;
		// opening from a pin or tile outside the current place widens to that photo's spot
		const inView = this.gallery.some((g) => g.id === p);
		const base = inView ? this.nav : { ...this.nav, c: ph.country, s: ph.spot };
		this.pushedPhoto = true;
		this.go({ ...base, p });
	};
	/** lightbox prev/next */
	showPhoto = (p: string) => this.go({ ...this.nav, p }, 'replace');
	closePhoto = () => {
		if (!this.nav.p) return;
		if (this.pushedPhoto) history.back();
		else this.go({ ...this.nav, p: null }, 'replace');
		this.pushedPhoto = false;
	};
}

export const app = new AppState();
