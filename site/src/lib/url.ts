// URL <-> Nav (docs/02-architecture.md "URL scheme", Phase 4.6 filters). Pure, so it's unit tested.
import type { Level, Nav } from './types';

const KEYS = ['c', 's', 'p', 'who', 'trip'] as const;

export const EMPTY: Nav = { c: null, s: null, p: null, who: null, trip: null };

export function parseNav(search: string): Nav {
	const q = new URLSearchParams(search);
	return { c: q.get('c'), s: q.get('s'), p: q.get('p'), who: q.get('who'), trip: q.get('trip') };
}

export function navToSearch(n: Nav): string {
	const q = new URLSearchParams();
	for (const k of KEYS) if (n[k]) q.set(k, n[k]);
	const s = q.toString();
	return s ? `?${s}` : '';
}

export type Lookup = {
	/** visible (not hidden) person */
	person: (id: string) => boolean;
	/** a visit (trip) and who was on it */
	visit: (id: string) => { companions: string[] } | undefined;
	/** visit ids of a country / spot; undefined if it doesn't exist */
	countryVisits: (c: string) => string[] | undefined;
	spotVisits: (c: string, s: string) => string[] | undefined;
	photo: (p: string) => { country: string; spot: string; visit: string } | undefined;
};

/** Which visits pass the Traveler + Trip filters. */
export const visitFilter =
	(n: Pick<Nav, 'who' | 'trip'>, has: Lookup) =>
	(visitId: string): boolean =>
		(!n.trip || visitId === n.trip) && (!n.who || !!has.visit(visitId)?.companions.includes(n.who));

/** Drop anything that doesn't exist, doesn't nest, or that the filters leave empty
 *  (an emptied spot goes up to its country, an emptied country up to the world). */
export function sanitize(n: Nav, has: Lookup): Nav {
	const who = n.who && has.person(n.who) ? n.who : null;
	const tv = n.trip ? has.visit(n.trip) : undefined;
	const trip = tv && (!who || tv.companions.includes(who)) ? n.trip : null;
	const ok = visitFilter({ who, trip }, has);
	const c = n.c && has.countryVisits(n.c)?.some(ok) ? n.c : null;
	const s = c && n.s && has.spotVisits(c, n.s)?.some(ok) ? n.s : null;
	const ph = n.p ? has.photo(n.p) : undefined;
	const p = ph && c && ph.country === c && (!s || ph.spot === s) && ok(ph.visit) ? n.p : null;
	return { c, s, p, who, trip };
}

export const levelOf = (n: Nav): Level => (n.s ? 'spot' : n.c ? 'country' : 'world');
