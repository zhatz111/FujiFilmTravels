import { describe, expect, it } from 'vitest';
import { coord, names, takenText } from './format';
import {
	EMPTY,
	levelOf,
	navToSearch,
	parseNav,
	photoFilter,
	sanitize,
	type Lookup,
	type PhotoLite
} from './url';

// Japan, two trips. Photographer = who took it; people = who is tagged in it.
const PHOTOS: Record<string, PhotoLite> = {
	k1: {
		country: 'japan',
		spot: 'kobe',
		visit: 'japan-2025-04',
		photographer: 'zach',
		people: ['alex']
	},
	k2: {
		country: 'japan',
		spot: 'kobe',
		visit: 'japan-2025-04',
		photographer: 'alex',
		people: ['zach']
	},
	t1: { country: 'japan', spot: 'tokyo', visit: 'japan-2023-01', photographer: 'zach' },
	t2: {
		country: 'japan',
		spot: 'tokyo',
		visit: 'japan-2025-04',
		photographer: 'alex',
		people: ['alex']
	}
};
const has: Lookup = {
	person: (id) => id === 'zach' || id === 'alex',
	visit: (id) => id === 'japan-2025-04' || id === 'japan-2023-01',
	photosIn: (c, s) => {
		const list = Object.values(PHOTOS).filter((p) => p.country === c && (!s || p.spot === s));
		return list.length ? list : undefined;
	},
	photo: (p) => PHOTOS[p]
};
const nav = (n: Partial<typeof EMPTY>) => ({ ...EMPTY, ...n });

describe('url state', () => {
	it('round-trips every param', () => {
		const n = { c: 'japan', s: 'kobe', p: 'k1', by: 'zach', who: 'alex', trip: 'japan-2025-04' };
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
		expect(sanitize(nav({ by: 'ghost', who: 'ghost', trip: 'nope' }), has)).toEqual(EMPTY);
	});

	it('Photographer keeps only photos that person took', () => {
		const ok = photoFilter({ by: 'alex', who: null, trip: null });
		expect(Object.keys(PHOTOS).filter((id) => ok(PHOTOS[id]))).toEqual(['k2', 't2']);
		// tokyo still has t2 by alex, but the open photo t1 (by zach) is dropped
		expect(sanitize(nav({ c: 'japan', s: 'tokyo', p: 't1', by: 'alex' }), has)).toEqual(
			nav({ c: 'japan', s: 'tokyo', by: 'alex' })
		);
	});

	it('Traveler keeps only photos that person is tagged in (not ones they took)', () => {
		const ok = photoFilter({ by: null, who: 'alex', trip: null });
		expect(Object.keys(PHOTOS).filter((id) => ok(PHOTOS[id]))).toEqual(['k1', 't2']);
	});

	it('combines filters, and an emptied spot goes up a level', () => {
		// photos of alex taken by zach: only k1 (kobe) -> tokyo is empty, back to Japan
		expect(sanitize(nav({ c: 'japan', s: 'tokyo', by: 'zach', who: 'alex' }), has)).toEqual(
			nav({ c: 'japan', by: 'zach', who: 'alex' })
		);
		// the 2023 trip never went to kobe
		expect(sanitize(nav({ c: 'japan', s: 'kobe', trip: 'japan-2023-01' }), has)).toEqual(
			nav({ c: 'japan', trip: 'japan-2023-01' })
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
