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

const SIDE = 340; // desktop sidebar width
const MAT = 10; // desktop: the thin border between photo and card edge
const MAT_PHONE = 8;
const INFO_MIN = 200; // phones: the details panel under the photo gets at least this much
const MIN_W = SIDE + 320; // desktop card never narrower or shorter than the sidebar needs
const MIN_H = 480;

type Box = { x: number; y: number; w: number; h: number };
/** card: the whole card. area: where PhotoSwipe fits the photo. img: the fitted photo itself.
 *  info: the details panel. All in viewport pixels, measured from the top-left (not the bottom:
 *  iPhone Safari sizes a fixed overlay taller than the visible area, behind its toolbar). */
type Layout = { wide: boolean; card: Box; area: Box; img: Box; info: Box };

/** The viewer for one photo. The card hugs the photo (a thin even border all round) on desktop;
 *  on phones the photo sits at the top of a full-height card and the details get the rest. */
function layout(vp: { x: number; y: number }, p?: Photo): Layout {
	const wide = vp.x > 900;
	const m = wide ? 32 : 8;
	const maxW = Math.min(vp.x - 2 * m, 1480);
	const maxH = Math.min(vp.y - 2 * m, 940);
	const fit = (aw: number, ah: number) => {
		const s = p ? Math.min(aw / p.w, ah / p.h, 1) : 1;
		return p ? { w: p.w * s, h: p.h * s } : { w: aw, h: ah };
	};
	let card: Box, area: Box, info: Box;
	if (wide) {
		const f = fit(maxW - SIDE - 2 * MAT, maxH - 2 * MAT);
		const w = Math.max(f.w + 2 * MAT + SIDE, MIN_W);
		const h = Math.max(f.h + 2 * MAT, MIN_H);
		card = { x: (vp.x - w) / 2, y: (vp.y - h) / 2, w, h };
		area = { x: card.x + MAT, y: card.y + MAT, w: w - SIDE - 2 * MAT, h: h - 2 * MAT };
		info = { x: card.x + w - SIDE, y: card.y, w: SIDE, h };
	} else {
		card = { x: m, y: (vp.y - maxH) / 2, w: maxW, h: maxH };
		const f = fit(maxW - 2 * MAT_PHONE, maxH - MAT_PHONE - INFO_MIN);
		area = { x: m + MAT_PHONE, y: card.y + MAT_PHONE, w: maxW - 2 * MAT_PHONE, h: f.h };
		const top = area.y + area.h + MAT_PHONE;
		info = { x: m, y: top, w: maxW, h: card.y + maxH - top };
	}
	const f = fit(area.w, area.h);
	const img = { x: area.x + (area.w - f.w) / 2, y: area.y + (area.h - f.h) / 2, w: f.w, h: f.h };
	return { wide, card, area, img, info };
}

const mixBox = (a: Box, b: Box, k: number): Box => ({
	x: a.x + (b.x - a.x) * k,
	y: a.y + (b.y - a.y) * k,
	w: a.w + (b.w - a.w) * k,
	h: a.h + (b.h - a.h) * k
});

/** Place an element at a box: position by `translate` (composited), size by width/height. */
function put(el: HTMLElement | null | undefined, b: Box, size = true) {
	if (!el) return;
	el.style.translate = `${b.x}px ${b.y}px`;
	if (size) {
		el.style.width = `${b.w}px`;
		el.style.height = `${b.h}px`;
	}
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
	const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
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
		showHideAnimationType: still ? 'fade' : 'zoom',
		showAnimationDuration: 360,
		hideAnimationDuration: 260, // leaving is quicker than arriving
		easing: 'cubic-bezier(0.23, 1, 0.32, 1)', // strong ease-out: moves at once, settles softly
		secondaryZoomLevel: 1,
		maxZoomLevel: 2,
		closeTitle: 'Close viewer',
		zoom: false,
		arrowPrevSVG: icon('M15 6l-6 6 6 6'),
		arrowNextSVG: icon('M9 6l6 6-6 6'),
		closeSVG: icon('M6 6l12 12M18 6 6 18'),
		arrowPrevTitle: 'Previous photo',
		arrowNextTitle: 'Next photo',
		// the photo sits inside the card, a thin border from its edge
		paddingFn: (vp, _, i) => {
			const { area: a } = layout(vp, list[i]);
			return { top: a.y, left: a.x, right: vp.x - a.x - a.w, bottom: vp.y - a.y - a.h };
		}
	});
	// The arrow buttons glide to the next photo on the same spring a swipe uses (critically damped,
	// ~0.2 s, interruptible) instead of PhotoSwipe's default instant cut; the card's shape follows.
	// Arrow keys stay instant: a key gets pressed over and over, and animating it only adds lag.
	// Reduced motion keeps the cut everywhere.
	if (!still) {
		pswp.next = () => pswp!.mainScroll.moveIndexBy(1, true);
		pswp.prev = () => pswp!.mainScroll.moveIndexBy(-1, true);
	}
	pswp.on('keydown', (e) => {
		const d = ({ ArrowLeft: -1, ArrowRight: 1 } as Record<string, number>)[e.originalEvent.key];
		// zoomed in, PhotoSwipe's arrow keys pan the photo instead; leave those alone
		if (!d || pswp!.element?.classList.contains('pswp--zoomed-in')) return;
		e.preventDefault();
		pswp!.mainScroll.moveIndexBy(d);
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
				// The card's shape tracks the slide position 1:1, never on its own timer: halfway through a
				// swipe (dragged, flicked, or glided by the arrow buttons) it is halfway between the two
				// photos' shapes, so the card and the photos move as one and can be reversed mid-way.
				// Each element is placed directly (no inherited CSS variables: those restyle every child).
				const q = (sel: string) => ps.element!.querySelector<HTMLElement>(sel);
				const place = () => {
					const vp = ps.viewportSize;
					const n = list.length;
					const ms = ps.mainScroll;
					// which photo is on screen, as a fractional index: the slide we're headed to (PhotoSwipe
					// only updates currIndex once it lands) minus how far the strip still is from it
					const pos = ms.slideWidth
						? ps.potentialIndex - (ms.x - ms.getCurrSlideX()) / ms.slideWidth
						: ps.currIndex;
					const i = Math.floor(pos);
					const k = pos - i;
					let L = layout(vp, list[((i % n) + n) % n]);
					if (k > 0.001 && n > 1) {
						const o = layout(vp, list[(((i + 1) % n) + n) % n]);
						L = {
							wide: L.wide,
							card: mixBox(L.card, o.card, k),
							area: mixBox(L.area, o.area, k),
							img: mixBox(L.img, o.img, k),
							info: mixBox(L.info, o.info, k)
						};
					}
					const { card: c, img, area: a } = L;
					put(el, c);
					put(q('.pswp__info'), L.info);
					// close: the card's top corner on desktop (over the sidebar), on the photo on phones
					const close = L.wide
						? { x: c.x + c.w - 14 - 32, y: c.y + 14 }
						: { x: img.x + img.w - 8 - 32, y: img.y + 8 };
					put(q('.pswp__button--close'), { ...close, w: 0, h: 0 }, false);
					const mid = img.y + img.h / 2 - 20;
					put(q('.pswp__button--arrow--prev'), { x: img.x + 12, y: mid, w: 0, h: 0 }, false);
					const next = { x: img.x + img.w - 12 - 40, y: mid, w: 0, h: 0 };
					put(q('.pswp__button--arrow--next'), next, false);
					// zoomed in, the photo stays inside its area (lightbox.css applies it only while zoomed)
					ps.container?.style.setProperty(
						'--clip',
						`inset(${a.y}px calc(100% - ${a.x + a.w}px) calc(100% - ${a.y + a.h}px) ${a.x}px round 8px)`
					);
				};
				for (const ev of ['moveMainScroll', 'change', 'resize'] as const) ps.on(ev, place);
				place();
			}
		});
	});
	// clicks on the card's mat or sidebar stay open; only the backdrop outside the card closes
	pswp.on('bgClickAction', (e) => {
		const { card: c } = layout(pswp!.viewportSize, list[pswp!.currIndex]);
		const { clientX: x, clientY: y } = e.originalEvent;
		if (x > c.x && x < c.x + c.w && y > c.y && y < c.y + c.h) e.preventDefault();
	});
	pswp.on('uiRegister', () => {
		pswp!.ui!.registerElement({
			name: 'info',
			appendTo: 'root',
			order: 9,
			onInit: (el, ps) => {
				el.setAttribute('aria-live', 'polite');
				// PhotoSwipe takes the wheel/trackpad for zooming anywhere in the viewer; over the details it
				// should just scroll them
				el.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
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
	// the page behind stays put: a swipe on the viewer never scrolls it
	document.documentElement.style.overflow = 'hidden';
	pswp.on('destroy', () => {
		document.documentElement.style.overflow = '';
		pswp = null;
		onClose();
	});
	pswp.init();
}

export function close() {
	pswp?.close();
}
