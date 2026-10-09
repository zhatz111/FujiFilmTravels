// Trip status, decided in the visitor's browser (docs/06-trips-and-live-status.md). Pure, unit tested.
import type { Trip } from './types';

export type TripStatus = 'live' | 'upcoming' | 'past' | 'hidden';

/** Today's calendar date ("YYYY-MM-DD") at the trip's destination. */
export function todayIn(tz: string, now: Date): string {
	const p = Object.fromEntries(
		new Intl.DateTimeFormat('en-US', {
			timeZone: tz,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit'
		})
			.formatToParts(now)
			.map((x) => [x.type, x.value])
	);
	return `${p.year}-${p.month}-${p.day}`;
}

const DAY = 86_400_000;
const utc = (d: string) => Date.parse(`${d}T00:00:00Z`);
export const addDays = (d: string, n: number) =>
	new Date(utc(d) + n * DAY).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((utc(b) - utc(a)) / DAY);

export function tripStatus(t: Trip, now: Date): TripStatus {
	const today = todayIn(t.tz, now);
	if (today > t.end) return 'past';
	if (addDays(t.start, t.live_delay_days ?? 1) <= today) return 'live';
	if ((t.show_upcoming ?? true) && today < t.start) return 'upcoming';
	return 'hidden';
}

/** The live trip to show; if several are live, the one that started most recently. */
export const liveTrip = (trips: Trip[], now: Date) =>
	trips
		.filter((t) => tripStatus(t, now) === 'live')
		.sort((a, b) => b.start.localeCompare(a.start))[0];

/** Upcoming trips, soonest first. */
export const upcomingTrips = (trips: Trip[], now: Date) =>
	trips
		.filter((t) => tripStatus(t, now) === 'upcoming')
		.sort((a, b) => a.start.localeCompare(b.start));

/** "tomorrow" | "in 95 days" (days counted at the destination). */
export function countdown(t: Trip, now: Date): string {
	const n = daysBetween(todayIn(t.tz, now), t.start);
	return n <= 1 ? 'tomorrow' : `in ${n} days`;
}

/** Privacy: never draw more precisely than the trip allows (region ~10 km, city ~1 km). */
export function displayPoint(t: Trip): [number, number] {
	const k = t.precision === 'city' ? 100 : 10;
	return [Math.round(t.lon * k) / k, Math.round(t.lat * k) / k];
}

/** "Lofoten, Norway" -> "Lofoten" for tight map labels. */
export const shortName = (t: Trip) => t.name.split(',')[0].trim();
