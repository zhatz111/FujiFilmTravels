import { describe, expect, it } from 'vitest';
import { groupNearby, km } from './group';

// Kobe harbour and points around it
const harbour = { id: 'a', lat: 34.6823, lon: 135.1866 };
const block = { id: 'b', lat: 34.6869, lon: 135.1906 }; // ~0.6 km away
const sannomiya = { id: 'c', lat: 34.6995, lon: 135.198 }; // ~2.2 km from the harbour
const osaka = { id: 'd', lat: 34.6937, lon: 135.5023 }; // ~29 km away

describe('photo grouping', () => {
	it('measures short distances', () => {
		expect(km(harbour.lat, harbour.lon, block.lat, block.lon)).toBeCloseTo(0.62, 1);
		expect(km(harbour.lat, harbour.lon, osaka.lat, osaka.lon)).toBeGreaterThan(25);
	});

	it('puts photos within about a mile into one group, keeping order', () => {
		const groups = groupNearby([harbour, osaka, block]);
		expect(groups.map((g) => g.items.map((p) => p.id))).toEqual([['a', 'b'], ['d']]);
	});

	it('moves the group center to the mean of its photos', () => {
		const [g] = groupNearby([harbour, block]);
		expect(g.lat).toBeCloseTo((harbour.lat + block.lat) / 2, 6);
	});

	it('keeps farther photos apart', () => {
		expect(groupNearby([harbour, sannomiya]).length).toBe(2);
		expect(groupNearby([harbour, sannomiya], 5).length).toBe(1);
	});
});
