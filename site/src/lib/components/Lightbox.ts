// PhotoSwipe v5 with an info sidebar. Driven by app state: open(list, index) when `p` appears,
// close() when it goes away; slide changes and closing report back through callbacks.
import type PhotoSwipe from 'photoswipe';
import {
	countryById,
	getSpot,
	imgUrl,
	initials,
	personById,
	personName,
	visitById
} from '#lib/data.ts';
import { coord, names, takenText } from '#lib/format.ts';
import type { Photo } from '#lib/types.ts';

let pswp: PhotoSwipe | null = null;
let list: Photo[] = [];

const esc = (s: string) =>
	s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

function info(p: Photo, i: number, n: number): string {
	const spot = getSpot(p.country, p.spot);
	const c = p.camera ?? {};
	const with_ = (visitById.get(p.visit)?.companions ?? []).filter((id) => id !== p.photographer);
	const rows: [string, string | undefined][] = [
		['Location', coord(p.lat, p.lon)],
		['Taken', takenText(p.taken)],
		['Aperture', c.f ? `f/${c.f}` : undefined],
		['Shutter', c.shutter && `${c.shutter} s`],
		['ISO', c.iso ? `${c.iso}` : undefined],
		['Focal length', c.focal_mm ? `${c.focal_mm} mm` : undefined],
		['Camera', [c.make, c.model].filter(Boolean).join(' ')],
		['Lens', c.lens]
	];
	return `
		<div class="pswp-info__head">
			<span class="pswp-info__pos">${i + 1} / ${n}</span>
			<h3>${esc(spot?.name ?? '')}</h3>
			<span class="pswp-info__country">${esc(countryById.get(p.country)?.name ?? '')}</span>
		</div>
		<dl>${rows
			.filter(([, v]) => v)
			.map(([k, v]) => `<dt>${k}</dt><dd${k === 'Location' ? ' class="loc"' : ''}>${esc(v!)}</dd>`)
			.join('')}</dl>
		<p class="pswp-info__people">Photo by <b>${esc(personName(p.photographer))}</b>${
			with_.length ? `<br>With ${esc(names(with_.map(personName)))}` : ''
		}${p.people?.length ? `<br>In this photo: ${esc(names(p.people.map(personName)))}` : ''}</p>
		${p.caption ? `<p>${esc(p.caption)}</p>` : ''}`;
}

const icon = (d: string) =>
	`<svg aria-hidden="true" class="pswp__icn" viewBox="0 0 24 24" width="22" height="22"><path d="${d}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const PEOPLE_ICON = icon(
	'M16 19v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1M10 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M20 19v-1a4 4 0 0 0-3-3.9M15 4.1a3 3 0 0 1 0 5.8'
);

/** "People in this photo" button + name list, pinned to the photo's bottom-left corner. */
function tagsHtml(p: Photo): string {
	const tags = (p.people ?? []).map((id) => personById.get(id)).filter((x) => !!x);
	if (!tags.length) return '';
	return `<button type="button" class="pswp-tags__btn" aria-expanded="false" aria-label="Show who is in this photo">${PEOPLE_ICON}<span>${tags.length}</span></button>
		<ul class="pswp-tags__list" hidden>${tags
			.map(
				(t) =>
					`<li><span class="pswp-tags__av" style="background:${t.color}">${esc(initials(t))}</span>${esc(t.name)}</li>`
			)
			.join('')}</ul>`;
}

const SIDE = 340; // sidebar width
const MAT_X = 72; // mat beside the photo: room for the arrows
const MAT_Y = 32;
const INFO_H = 220; // phones: metadata panel under the photo

const MIN_H = 520; // desktop card never gets shorter than the sidebar needs

/** Space around the photo inside the card: the mat (desktop) or close button + info panel (phones). */
const pad = (wide: boolean) =>
	wide ? { t: MAT_Y, b: MAT_Y, l: MAT_X, r: MAT_X + SIDE } : { t: 52, b: INFO_H, l: 8, r: 8 };

/** The viewer card for a photo, as insets from the viewport edges. Its height hugs the photo,
 *  so a landscape shot gets a thin mat above and below rather than a tall empty band. */
function card(vp: { x: number; y: number }, p?: Photo) {
	const wide = vp.x > 900;
	const m = wide ? 32 : 8;
	const w = Math.min(vp.x - 2 * m, 1480);
	const maxH = Math.min(vp.y - 2 * m, 940);
	const { t: pt, b: pb, l: pl, r: pr } = pad(wide);
	let h = maxH;
	if (p) {
		const fit = Math.min((w - pl - pr) / p.w, (maxH - pt - pb) / p.h, 1);
		h = Math.min(maxH, Math.max(p.h * fit + pt + pb, wide ? MIN_H : 0));
	}
	const l = (vp.x - w) / 2;
	const t = (vp.y - h) / 2;
	return { wide, t, l, r: l, b: t };
}

export const isOpen = () => !!pswp;

export async function open(
	photos: Photo[],
	index: number,
	onChange: (id: string) => void,
	onClose: () => void
) {
	if (pswp) {
		list = photos;
		if (pswp.currIndex !== index) pswp.goTo(index);
		return;
	}
	list = photos;
	const [{ default: PS }] = await Promise.all([
		import('photoswipe'),
		import('photoswipe/style.css')
	]);
	await import('./lightbox.css'); // after PhotoSwipe's own CSS so our overrides win
	pswp = new PS({
		dataSource: photos.map((p) => ({
			src: imgUrl(p, 2560),
			srcset: `${imgUrl(p, 1600)} 1600w, ${imgUrl(p, 2560)} 2560w`,
			msrc: imgUrl(p, 480),
			width: p.w,
			height: p.h,
			alt: p.caption ?? ''
		})),
		index,
		bgOpacity: 1,
		// the photo itself zooms out of its gallery tile and back into it (a cheap transform on one
		// image) while the backdrop and card fade around it; no tile on screen (a map pin) = fade
		showHideAnimationType: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'fade' : 'zoom',
		showAnimationDuration: 380,
		hideAnimationDuration: 300,
		easing: 'cubic-bezier(0.2, 0.9, 0.25, 1)', // ~critically damped: fast start, no overshoot
		secondaryZoomLevel: 1,
		maxZoomLevel: 2,
		closeTitle: 'Close viewer',
		zoom: false,
		arrowPrevSVG: icon('M15 6l-6 6 6 6'),
		arrowNextSVG: icon('M9 6l6 6-6 6'),
		closeSVG: icon('M6 6l12 12M18 6 6 18'),
		arrowPrevTitle: 'Previous photo',
		arrowNextTitle: 'Next photo',
		// the photo sits inside the card, with a mat around it for the arrows (and the sidebar)
		paddingFn: (vp, _, i) => {
			const c = card(vp, list[i]);
			const g = pad(c.wide);
			return { top: c.t + g.t, bottom: c.b + g.b, left: c.l + g.l, right: c.r + g.r };
		}
	});
	pswp.addFilter('thumbBounds', (bounds, _, i) => {
		const img = document.querySelector(`[data-photo="${list[i]?.id}"] img`);
		const r = img?.getBoundingClientRect();
		// no tile on screen: PhotoSwipe takes undefined to mean "fade instead" (its types say otherwise)
		if (!r?.width || r.bottom < 0 || r.top > innerHeight) return bounds!;
		return { x: r.left, y: r.top, w: r.width };
	});
	pswp.on('uiRegister', () => {
		pswp!.ui!.registerElement({
			name: 'card',
			appendTo: 'root',
			onInit: (el, ps) => {
				// behind the photo, above the backdrop (once PhotoSwipe has appended it, right after onInit)
				queueMicrotask(() => ps.element!.insertBefore(el, ps.scrollWrap!));
				const place = () => {
					const c = card(ps.viewportSize, list[ps.currIndex]);
					for (const k of ['t', 'r', 'b', 'l'] as const)
						ps.element!.style.setProperty(`--c${k}`, `${c[k]}px`);
					ps.element!.style.setProperty('--side', `${SIDE}px`);
					ps.element!.style.setProperty('--info-h', `${INFO_H}px`);
				};
				ps.on('resize', place);
				ps.on('change', place); // resize the card to the new photo
				place();
			}
		});
	});
	// clicks on the card's mat or sidebar stay open; only the backdrop outside the card closes
	pswp.on('bgClickAction', (e) => {
		const c = card(pswp!.viewportSize, list[pswp!.currIndex]);
		const { clientX: x, clientY: y } = e.originalEvent;
		if (x > c.l && x < pswp!.viewportSize.x - c.r && y > c.t && y < pswp!.viewportSize.y - c.b)
			e.preventDefault();
	});
	pswp.on('uiRegister', () => {
		pswp!.ui!.registerElement({
			name: 'info',
			appendTo: 'root',
			order: 9,
			onInit: (el, ps) => {
				el.setAttribute('aria-live', 'polite');
				const update = () => (el.innerHTML = info(list[ps.currIndex], ps.currIndex, list.length));
				ps.on('change', update);
				update();
			}
		});
	});
	pswp.on('uiRegister', () => {
		pswp!.ui!.registerElement({
			name: 'tags',
			appendTo: 'root',
			order: 10,
			onInit: (el, ps) => {
				const update = () => (el.innerHTML = tagsHtml(list[ps.currIndex]));
				el.addEventListener('click', (e) => {
					const btn = (e.target as HTMLElement).closest('.pswp-tags__btn');
					if (!btn) return;
					const open = btn.getAttribute('aria-expanded') !== 'true';
					btn.setAttribute('aria-expanded', `${open}`);
					el.querySelector('ul')!.hidden = !open;
				});
				// follow the photo as it zooms, pans or swipes: only when PhotoSwipe moves it, not every frame
				const follow = () => {
					const img = ps.currSlide?.content?.element as HTMLElement | undefined;
					const r = img?.getBoundingClientRect();
					if (r?.width) el.style.transform = `translate(${r.left + 12}px, ${r.bottom - 12}px)`;
				};
				ps.on('change', update);
				for (const ev of [
					'change',
					'zoomPanUpdate',
					'moveMainScroll',
					'resize',
					'loadComplete'
				] as const)
					ps.on(ev, () => requestAnimationFrame(follow));
				update();
				follow();
			}
		});
	});
	pswp.on('change', () => onChange(list[pswp!.currIndex].id));
	pswp.on('destroy', () => {
		pswp = null;
		onClose();
	});
	pswp.init();
}

export function close() {
	pswp?.close();
}
