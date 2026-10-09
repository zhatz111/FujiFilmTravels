// Small shared motion helpers (Apple-style: short, critically damped, never bouncy unless thrown).
import { cubicOut } from 'svelte/easing';
import type { TransitionConfig } from 'svelte/transition';

export const reducedMotion = () =>
	typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Content arriving: fade in while settling up 6px. Reduced motion: a plain quick fade. */
export function arrive(_: Element, { delay = 0 } = {}): TransitionConfig {
	const still = reducedMotion();
	return {
		delay,
		duration: still ? 150 : 260,
		easing: cubicOut,
		css: (t) => `opacity: ${t};${still ? '' : ` transform: translateY(${(1 - t) * 6}px);`}`
	};
}
