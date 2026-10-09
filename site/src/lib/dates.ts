// Calendar-date formatting for visits (docs/08-build-plan.md, Phase 4.5). Pure and unit tested.
// Dates are "YYYY-MM-DD" calendar dates: formatted in UTC so no time-zone shifting happens.

const fmt = (opts: Intl.DateTimeFormatOptions) =>
	new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'UTC' });
const MON = fmt({ month: 'short' });
const MONTH = fmt({ month: 'long' });

const parts = (d: string) => {
	const [y, m, day] = d.split('-').map(Number);
	const date = new Date(Date.UTC(y, m - 1, day));
	return { y, m, day, mon: MON.format(date), month: MONTH.format(date) };
};

/** "Mar 14, 2025" | "Mar 9 – 21, 2025" | "Feb 27 – Mar 4, 2025" | "Dec 28, 2024 – Jan 3, 2025".
 *  withYear=false drops the year when start and end share it ("Mar 9 – 11"). */
export function range(start: string, end: string, withYear = true): string {
	const a = parts(start);
	const b = parts(end);
	const yr = (p: typeof a) => (withYear ? `, ${p.y}` : '');
	if (start === end) return `${a.mon} ${a.day}${yr(a)}`;
	if (a.y !== b.y) return `${a.mon} ${a.day}, ${a.y} – ${b.mon} ${b.day}, ${b.y}`;
	if (a.m === b.m) return `${a.mon} ${a.day} – ${b.day}${yr(b)}`;
	return `${a.mon} ${a.day} – ${b.mon} ${b.day}${yr(b)}`;
}

/** "Mar 2025" */
export const monthYear = (d: string) => `${parts(d).mon} ${parts(d).y}`;

/** "Oct 16" */
export const monthDay = (d: string) => `${parts(d).mon} ${parts(d).day}`;

/** "March 2025" */
export const longMonthYear = (d: string) => `${parts(d).month} ${parts(d).y}`;

/** Short form for several visits, newest first: "Mar 2025 · Jan 2023", at most 2, then "+n more". */
export function visitsShort(starts: string[]): string {
	const uniq = [...new Set(starts.map(monthYear))];
	const shown = uniq.slice(0, 2).join(' · ');
	return uniq.length > 2 ? `${shown} +${uniq.length - 2} more` : shown;
}

/** Visit years for globe pin labels, newest first: "2025 · 2023". */
export const years = (starts: string[]) =>
	[...new Set(starts.map((d) => d.slice(0, 4)))].slice(0, 2).join(' · ');
