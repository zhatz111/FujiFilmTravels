// Mirrors the /data JSON contract (docs/04-photo-pipeline.md, pipeline/src/pipeline/schemas.py).

export type Camera = {
	make?: string;
	model?: string;
	lens?: string;
	focal_mm?: number;
	f?: number;
	shutter?: string;
	iso?: number;
};

export type Photo = {
	id: string;
	hash: string;
	/** original filename in photos/inbox */
	source: string;
	/** true = location from the camera's GPS; false = filled in by hand or from the nearest photo */
	gps: boolean;
	country: string;
	spot: string;
	lat: number;
	lon: number;
	alt_m?: number;
	taken: string;
	w: number;
	h: number;
	color: string;
	camera?: Camera;
	caption?: string;
	favorite?: boolean;
	photographer: string;
	/** people tagged in the photo */
	people?: string[];
	visit: string;
};

export type SpotVisit = {
	visit: string;
	start: string;
	end: string;
	photos: number;
	people: string[];
};

export type Spot = {
	id: string;
	country: string;
	name: string;
	lat: number;
	lon: number;
	radius_km: number;
	zoom: number;
	count: number;
	photos: string[];
	visits: SpotVisit[];
};

export type Visit = {
	id: string;
	start: string;
	end: string;
	photos: number;
	label?: string;
	companions: string[];
	photographers: string[];
};

export type Country = {
	id: string;
	iso2: string;
	name: string;
	lat: number;
	lon: number;
	zoom: number;
	count: number;
	spots: string[];
	cover: string[];
	last_visit: string;
	visits: Visit[];
	label_left?: boolean;
};

export type Person = {
	id: string;
	name: string;
	color: string;
	initials?: string;
	avatar?: string;
	relation?: string;
	show_photos?: boolean;
	hidden?: boolean;
};

export type Trip = {
	id: string;
	name: string;
	lat: number;
	lon: number;
	start: string;
	end: string;
	tz: string;
	precision?: 'region' | 'city';
	live_delay_days?: number;
	hide_end_date?: boolean;
	show_upcoming?: boolean;
};

/** URL-driven state: country, spot, open photo, Traveler filter, Trip filter. */
export type Nav = {
	c: string | null;
	s: string | null;
	p: string | null;
	who: string | null;
	trip: string | null;
};

export type Level = 'world' | 'country' | 'spot';
