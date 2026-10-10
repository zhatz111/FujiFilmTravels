// Group photos taken close together (within GROUP_KM) into one map marker. Pure, unit tested.

/** About a mile: photos closer than this to a group's center share its marker. */
export const GROUP_KM = 1.6;

/** Distance in km; flat-earth approximation, plenty accurate at a few km. */
export function km(lat1: number, lon1: number, lat2: number, lon2: number): number {
	const dy = (lat2 - lat1) * 110.574;
	const dx = (lon2 - lon1) * 111.32 * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180);
	return Math.hypot(dx, dy);
}

export type Group<T> = { lat: number; lon: number; items: T[] };

/** Greedy grouping in list order: each photo joins the first group whose center is within
 *  `radiusKm`, and the center moves to the running mean. Keeps the list's order inside groups. */
export function groupNearby<T extends { lat: number; lon: number }>(
	list: T[],
	radiusKm = GROUP_KM
): Group<T>[] {
	const groups: Group<T>[] = [];
	for (const p of list) {
		const g = groups.find((g) => km(g.lat, g.lon, p.lat, p.lon) < radiusKm);
		if (!g) {
			groups.push({ lat: p.lat, lon: p.lon, items: [p] });
			continue;
		}
		g.items.push(p);
		g.lat += (p.lat - g.lat) / g.items.length;
		g.lon += (p.lon - g.lon) / g.items.length;
	}
	return groups;
}
