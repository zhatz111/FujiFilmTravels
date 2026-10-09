// Build-time import of the pipeline's /data contract + lookup maps. Unfiltered; the Traveler/Trip
// filters are applied in state.svelte.ts.
import countriesJson from '../../../data/countries.json';
import peopleJson from '../../../data/people.json';
import photosJson from '../../../data/photos.json';
import spotsJson from '../../../data/spots.json';
import tripsJson from '../../../data/trips.json';
import type { Country, Person, Photo, Spot, Trip, Visit } from './types';

export const photos = photosJson as Photo[];
export const spots = spotsJson as Spot[];
/** Most recent trip first. */
export const countries = (countriesJson as Country[])
	.slice()
	.sort((a, b) => b.last_visit.localeCompare(a.last_visit));

export const photoById = new Map(photos.map((p) => [p.id, p]));
export const countryById = new Map(countries.map((c) => [c.id, c]));
export const spotByKey = new Map(spots.map((s) => [`${s.country}/${s.id}`, s]));
export const getSpot = (c: string | null, s: string | null) =>
	c && s ? spotByKey.get(`${c}/${s}`) : undefined;

/** Spots of a country, in the pipeline's order (most photos first). */
export const spotsOf = (c: Country) =>
	c.spots.map((id) => spotByKey.get(`${c.id}/${id}`)).filter((s): s is Spot => !!s);

// ---- trips (visits) ----
export type CountryVisit = Visit & { country: string };
/** Every visit, newest first. */
export const visits: CountryVisit[] = countries
	.flatMap((c) => c.visits.map((v) => ({ ...v, country: c.id })))
	.sort((a, b) => b.start.localeCompare(a.start));
export const visitById = new Map(visits.map((v) => [v.id, v]));

/** Planned trips (data/trips.json). Their status is only decided in the browser: see trips.ts. */
export const trips = tripsJson as Trip[];

// ---- people ----
/** People who may appear on the site (hidden ones never do). */
export const people = (peopleJson as Person[]).filter((p) => !p.hidden);
export const personById = new Map(people.map((p) => [p.id, p]));
export const personName = (id: string) => personById.get(id)?.name ?? id;
export const initials = (p: Person) =>
	p.initials ??
	p.name
		.split(/\s+/)
		.map((w) => w[0])
		.join('')
		.slice(0, 2)
		.toUpperCase();

// Images live on R2 in production (PUBLIC_IMG_BASE=https://img.<domain>); locally the dev
// server serves photos/out at /p (see vite.config.ts).
const IMG_BASE = __IMG_BASE__.replace(/\/$/, '');
export const imgUrl = (p: Photo, width: 480 | 1600 | 2560) =>
	`${IMG_BASE}/p/${p.hash}-${width}.webp`;
export const srcset = (p: Photo) => `${imgUrl(p, 480)} 480w, ${imgUrl(p, 1600)} 1600w`;
