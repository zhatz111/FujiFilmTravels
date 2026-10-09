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
		showHideAnimationType: 'fade',
		secondaryZoomLevel: 1,
		maxZoomLevel: 2,
		closeTitle: 'Close viewer',
		arrowPrevSVG: icon('M15 6l-6 6 6 6'),
		arrowNextSVG: icon('M9 6l6 6-6 6'),
		closeSVG: icon('M6 6l12 12M18 6 6 18'),
		arrowPrevTitle: 'Previous photo',
		arrowNextTitle: 'Next photo',
		paddingFn: (vp) =>
			vp.x > 900
				? { top: 40, bottom: 40, left: 88, right: 420 }
				: { top: 64, bottom: 236, left: 8, right: 8 }
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
				// follow the photo as it resizes, zooms or swipes (one rect read per frame while open)
				let frame = 0;
				const follow = () => {
					const img = ps.currSlide?.content?.element as HTMLElement | undefined;
					const r = img?.getBoundingClientRect();
					if (r?.width) el.style.transform = `translate(${r.left + 12}px, ${r.bottom - 12}px)`;
					frame = requestAnimationFrame(follow);
				};
				ps.on('change', update);
				ps.on('destroy', () => cancelAnimationFrame(frame));
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
