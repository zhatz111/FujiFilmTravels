import { describe, expect, it } from 'vitest';
import {
	addDays,
	countdown,
	displayPoint,
	liveTrip,
	todayIn,
	tripStatus,
	upcomingTrips
} from './trips';
import type { Trip } from './types';

const trip = (t: Partial<Trip>): Trip => ({
	id: 'x',
	name: 'Lofoten, Norway',
	lat: 68.234,
	lon: 14.567,
	start: '2026-10-05',
	end: '2026-10-16',
	tz: 'Europe/Oslo',
	...t
});
/** a UTC instant */
const at = (iso: string) => new Date(iso);

describe('dates at the destination', () => {
	it('uses the destination time zone, not the visitor’s', () => {
		// 11:00 UTC on Jan 11 is already Jan 12 in Auckland (UTC+13 in summer)
		expect(todayIn('Pacific/Auckland', at('2027-01-11T11:00:00Z'))).toBe('2027-01-12');
		expect(todayIn('America/New_York', at('2027-01-11T03:00:00Z'))).toBe('2027-01-10');
	});

	it('adds days across month ends', () => {
		expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
	});
});

describe('trip status', () => {
	const t = trip({});

	it('is upcoming before the start', () => {
		expect(tripStatus(t, at('2026-10-04T12:00:00Z'))).toBe('upcoming');
	});

	it('waits live_delay_days (default 1) after arrival before going live', () => {
		expect(tripStatus(t, at('2026-10-05T12:00:00Z'))).toBe('hidden');
		expect(tripStatus(t, at('2026-10-06T12:00:00Z'))).toBe('live');
		expect(tripStatus(trip({ live_delay_days: 0 }), at('2026-10-05T12:00:00Z'))).toBe('live');
		expect(tripStatus(trip({ live_delay_days: 3 }), at('2026-10-07T12:00:00Z'))).toBe('hidden');
	});

	it('treats the end date as inclusive', () => {
		expect(tripStatus(t, at('2026-10-16T21:00:00Z'))).toBe('live'); // 23:00 in Oslo
		expect(tripStatus(t, at('2026-10-16T22:30:00Z'))).toBe('past'); // 00:30 Oct 17 in Oslo
	});

	it('flips by the destination calendar, not UTC', () => {
		const nz = trip({ start: '2027-01-12', end: '2027-01-26', tz: 'Pacific/Auckland' });
		// still Jan 11 in UTC, but Jan 13 has begun in Auckland -> live (start + 1 day)
		expect(tripStatus(nz, at('2027-01-12T12:00:00Z'))).toBe('live');
	});

	it('can stay hidden until live', () => {
		expect(tripStatus(trip({ show_upcoming: false }), at('2026-10-01T12:00:00Z'))).toBe('hidden');
	});
});

describe('picking trips', () => {
	it('shows the most recently started live trip', () => {
		const a = trip({ id: 'a', start: '2026-10-01', end: '2026-10-20' });
		const b = trip({ id: 'b', start: '2026-10-05', end: '2026-10-10' });
		expect(liveTrip([a, b], at('2026-10-08T12:00:00Z'))?.id).toBe('b');
		expect(liveTrip([a, b], at('2026-10-15T12:00:00Z'))?.id).toBe('a');
		expect(liveTrip([], at('2026-10-15T12:00:00Z'))).toBeUndefined();
	});

	it('lists upcoming trips soonest first with a countdown', () => {
		const later = trip({ id: 'later', start: '2027-01-12', end: '2027-01-26' });
		const soon = trip({ id: 'soon', start: '2026-10-10', end: '2026-10-12' });
		const now = at('2026-10-09T12:00:00Z');
		expect(upcomingTrips([later, soon], now).map((t) => t.id)).toEqual(['soon', 'later']);
		expect(countdown(soon, now)).toBe('tomorrow');
		expect(countdown(later, now)).toBe('in 95 days');
	});
});

describe('privacy', () => {
	it('rounds region trips to 1 decimal and city trips to 2', () => {
		expect(displayPoint(trip({}))).toEqual([14.6, 68.2]);
		expect(displayPoint(trip({ precision: 'city' }))).toEqual([14.57, 68.23]);
	});
});
