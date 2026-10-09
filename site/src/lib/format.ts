// Pure display helpers.

const f2 = (n: number) => Math.abs(n).toFixed(2);

/** 64.15°N 21.94°W */
export const coord = (lat: number, lon: number) =>
	`${f2(lat)}°${lat >= 0 ? 'N' : 'S'} ${f2(lon)}°${lon >= 0 ? 'E' : 'W'}`;

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const MONTHS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');

/** "2025-04-16T18:23:22+09:00" -> "Apr 16, 2025 · 18:23" in the photo's own local time (no tz shift). */
export function takenText(taken: string): string {
	const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(taken);
	if (!m) return taken;
	const day = `${MONTHS[+m[2] - 1]} ${+m[3]}, ${m[1]}`;
	return m[4] ? `${day} · ${m[4]}:${m[5]}` : day;
}

/** "Zach", "Zach & Alex", "Zach, Alex & Sam" */
export function names(list: string[]): string {
	if (list.length < 2) return list.join('');
	return `${list.slice(0, -1).join(', ')} & ${list[list.length - 1]}`;
}
