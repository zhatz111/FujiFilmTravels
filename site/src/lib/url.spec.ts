import { describe, expect, it } from 'vitest';
import { coord, names, takenText } from './format';
import { EMPTY, levelOf, navToSearch, parseNav, sanitize, type Lookup } from './url';

// japan-2025-04: zach + alex (kobe, tokyo); japan-2023-01: zach only (tokyo)
const visits: Record<string, string[]> = {
	'japan-2025-04': ['zach', 'alex'],
	'japan-2023-01': ['zach']
};
const has: Lookup = {
	person: (id) => id === 'zach' || id === 'alex',
	visit: (id) => (visits[id] ? { companions: visits[id] } : undefined),
	countryVisits: (c) => (c === 'japan' ? Object.keys(visits) : undefined),
	spotVisits: (c, s) =>
		c !== 'japan'
			? undefined
			: s === 'kobe'
				? ['japan-2025-04']
				: s === 'tokyo'
					? ['japan-2025-04', 'japan-2023-01']
					: undefined,
	photo: (p) =>
		p === 'k1'
			? { country: 'japan', spot: 'kobe', visit: 'japan-2025-04' }
			: p === 't1'
				? { country: 'japan', spot: 'tokyo', visit: 'japan-2023-01' }
				: undefined
};
const nav = (n: Partial<typeof EMPTY>) => ({ ...EMPTY, ...n });

describe('url state', () => {
	it('round-trips every param', () => {
		const n = { c: 'japan', s: 'kobe', p: 'k1', who: 'alex', trip: 'japan-2025-04' };
		expect(parseNav(navToSearch(n))).toEqual(n);
		expect(navToSearch(EMPTY)).toBe('');
		expect(navToSearch(nav({ c: 'japan' }))).toBe('?c=japan');
	});

	it('drops unknown or mis-nested params', () => {
		expect(sanitize(nav({ c: 'nope', s: 'kobe', p: 'k1' }), has)).toEqual(EMPTY);
		expect(sanitize(nav({ c: 'japan', s: 'nope' }), has)).toEqual(nav({ c: 'japan' }));
		expect(sanitize(nav({ c: 'japan', s: 'tokyo', p: 'k1' }), has)).toEqual(
			nav({ c: 'japan', s: 'tokyo' })
		);
		expect(sanitize(nav({ c: 'japan', p: 'k1' }), has)).toEqual(nav({ c: 'japan', p: 'k1' }));
		expect(sanitize(nav({ who: 'ghost', trip: 'nope' }), has)).toEqual(EMPTY);
	});

	it('filters empty a spot -> goes up a level, and drop photos outside the filter', () => {
		// alex was not on the 2023 trip: tokyo still has the 2025 visit, but t1 is filtered out
		expect(sanitize(nav({ c: 'japan', s: 'tokyo', p: 't1', who: 'alex' }), has)).toEqual(
			nav({ c: 'japan', s: 'tokyo', who: 'alex' })
		);
		// the 2023 trip never went to kobe
		expect(sanitize(nav({ c: 'japan', s: 'kobe', trip: 'japan-2023-01' }), has)).toEqual(
			nav({ c: 'japan', trip: 'japan-2023-01' })
		);
	});

	it('drops a trip the chosen traveler was not on', () => {
		expect(sanitize(nav({ who: 'alex', trip: 'japan-2023-01' }), has)).toEqual(
			nav({ who: 'alex' })
		);
	});

	it('derives level', () => {
		expect(levelOf(EMPTY)).toBe('world');
		expect(levelOf(nav({ c: 'japan', p: 'k1' }))).toBe('country');
		expect(levelOf(nav({ c: 'japan', s: 'kobe' }))).toBe('spot');
	});
});

describe('format', () => {
	it('formats coordinates with hemispheres', () => {
		expect(coord(64.1466, -21.9426)).toBe('64.15°N 21.94°W');
		expect(coord(-49.2714, 135.188)).toBe('49.27°S 135.19°E');
	});

	it('formats taken time without shifting time zones', () => {
		expect(takenText('2025-04-16T18:23:22+09:00')).toBe('Apr 16, 2025 · 18:23');
		expect(takenText('2025-03-09')).toBe('Mar 9, 2025');
	});
});

describe('names', () => {
	it('joins with commas and an ampersand', () => {
		expect(names([])).toBe('');
		expect(names(['Zach'])).toBe('Zach');
		expect(names(['Zach', 'Alex'])).toBe('Zach & Alex');
		expect(names(['Zach', 'Alex', 'Sam'])).toBe('Zach, Alex & Sam');
	});
});
