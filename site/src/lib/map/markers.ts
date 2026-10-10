// DOM for HTML markers. Each is a real <button> so it's focusable and announced.
// Styles live in Globe.svelte (:global, prefixed `pin-`).

const esc = (s: string) =>
	s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

function button(cls: string, label: string, html: string, onclick: () => void) {
	const b = document.createElement('button');
	b.type = 'button';
	b.className = cls;
	b.setAttribute('aria-label', label);
	b.innerHTML = html;
	b.addEventListener('click', (e) => {
		e.stopPropagation();
		onclick();
	});
	return b;
}

/** Sunrise dot + "JAPAN · 2025" chip (use anchor 'left', or 'right' when `left`). */
export const countryPin = (
	name: string,
	years: string,
	count: number,
	left: boolean,
	onclick: () => void
) =>
	button(
		`pin-country${left ? ' left' : ''}`,
		`${name}, ${count} photos, visited ${years}`,
		`<span class="dot"></span><span class="chip">${esc(name)}${years ? ` · ${years}` : ''}</span>`,
		onclick
	);

/** 38px circle with the count, name chip (+ date line) underneath. */
export const spotPin = (name: string, count: number, dates: string, onclick: () => void) =>
	button(
		'pin-spot',
		`${name}, ${count} photos${dates ? `, ${dates}` : ''}`,
		`<span class="circle">${count}</span><span class="chip">${esc(name)}${
			dates ? `<small>${esc(dates)}</small>` : ''
		}</span>`,
		onclick
	);

/** Several spots too close to tell apart at this zoom: a stacked circle with their combined photo
 *  count and "3 spots"; clicking zooms in until they separate (use anchor 'top', offset -19). */
export function spotClusterPin(names: string[], count: number, onclick: () => void) {
	const shown = names.slice(0, 2).join(', ') + (names.length > 2 ? ` +${names.length - 2}` : '');
	return button(
		'pin-spot cluster',
		`${names.length} spots close together: ${names.join(', ')}. ${count} photos. Zoom in.`,
		`<span class="circle">${count}</span><span class="chip">${names.length} spots<small>${esc(shown)}</small></span>`,
		onclick
	);
}

const TEAR =
	'<svg viewBox="0 0 26 36" aria-hidden="true"><path d="M13 35C13 35 1 21.5 1 13a12 12 0 0 1 24 0c0 8.5-12 22-12 22z"/><circle cx="13" cy="13" r="8.5" fill="#fff"/></svg>';

/** Teardrop in the photographer's color; its tip sits on the coordinate (use anchor 'bottom'). */
export function photoPin(
	n: number | string,
	label: string,
	hover: string,
	color: string,
	delay: number | null,
	onclick: () => void
) {
	const b = button(
		'pin-photo',
		label,
		`<span class="drop"${delay === null ? '' : ` style="--i:${delay}"`}>${TEAR}<span class="num">${n}</span><span class="tip">${esc(hover)}</span></span>`,
		onclick
	);
	b.style.setProperty('--pin', color);
	if (delay !== null) b.classList.add('dropping');
	return b;
}

/** Trip marker: live = green dot with two pulse rings, upcoming = blue ring with a dashed halo.
 *  The dot sits on the coordinate (use anchor 'left' with a -9px offset). */
export const tripPin = (
	kind: 'live' | 'upcoming',
	label: string,
	aria: string,
	onclick: () => void
) =>
	button(
		`pin-trip ${kind}`,
		aria,
		`<span class="mark"><i></i><i></i></span><span class="chip">${esc(label)}</span>`,
		onclick
	);

export const ringLabel = (text: string) => {
	const el = document.createElement('span');
	el.className = 'pin-ring-label';
	el.textContent = text;
	return el;
};

/** Polygon approximating a circle of radius km around lon/lat (for the dashed spot ring). */
export function circle(lon: number, lat: number, km: number, steps = 96): [number, number][] {
	const dLat = km / 110.574;
	const dLon = km / (111.32 * Math.cos((lat * Math.PI) / 180));
	return Array.from({ length: steps + 1 }, (_, i) => {
		const a = (i / steps) * 2 * Math.PI;
		return [lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)];
	});
}
