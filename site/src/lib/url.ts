// URL <-> Nav (docs/02-architecture.md "URL scheme", Phase 4.6 filters). Pure, so it's unit tested.
import type { Level, Nav } from './types';

const KEYS = ['c', 's', 'p', 'by', 'who', 'trip'] as const;

export const EMPTY: Nav = { c: null, s: null, p: null, by: null, who: null, trip: null };

export function parseNav(search: string): Nav {
	const q = new URLSearchParams(search);
	return {
		c: q.get('c'),
		s: q.get('s'),
		p: q.get('p'),
		by: q.get('by'),
		who: q.get('who'),
		trip: q.get('trip')
	};
}

export function navToSearch(n: Nav): string {
	const q = new URLSearchParams();
	for (const k of KEYS) if (n[k]) q.set(k, n[k]);
	const s = q.toString();
	return s ? `?${s}` : '';
}

/** The bits of a photo the filters look at. */
export type PhotoLite = {
	country: string;
	spot: string;
	visit: string;
	photographer: string;
	people?: string[];
};

export type Lookup = {
	/** visible (not hidden) person */
	person: (id: string) => boolean;
	/** does this visit (trip) exist */
	visit: (id: string) => boolean;
	/** photos of a country, or of one of its spots; undefined if the place doesn't exist */
	photosIn: (c: string, s?: string) => PhotoLite[] | undefined;
	photo: (p: string) => PhotoLite | undefined;
};

/** Photographer (took it) + Traveler (tagged in it) + Trip, all at once. */
export const photoFilter =
	(n: Pick<Nav, 'by' | 'who' | 'trip'>) =>
	(p: PhotoLite): boolean =>
		(!n.trip || p.visit === n.trip) &&
		(!n.by || p.photographer === n.by) &&
		(!n.who || !!p.people?.includes(n.who));

/** Drop anything that doesn't exist, doesn't nest, or that the filters leave empty
 *  (an emptied spot goes up to its country, an emptied country up to the world). */
export function sanitize(n: Nav, has: Lookup): Nav {
	const by = n.by && has.person(n.by) ? n.by : null;
	const who = n.who && has.person(n.who) ? n.who : null;
	const trip = n.trip && has.visit(n.trip) ? n.trip : null;
	const ok = photoFilter({ by, who, trip });
	const c = n.c && has.photosIn(n.c)?.some(ok) ? n.c : null;
	const s = c && n.s && has.photosIn(c, n.s)?.some(ok) ? n.s : null;
	const ph = n.p ? has.photo(n.p) : undefined;
	const p = ph && c && ph.country === c && (!s || ph.spot === s) && ok(ph) ? n.p : null;
	return { c, s, p, by, who, trip };
}

export const levelOf = (n: Nav): Level => (n.s ? 'spot' : n.c ? 'country' : 'world');
