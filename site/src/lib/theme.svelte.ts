// Light/dark theme. app.html sets <html data-theme> before first paint; this keeps it in sync.
export const theme = $state({ dark: false });

export function initTheme() {
	theme.dark = document.documentElement.dataset.theme === 'dark';
}

/** Flip day <-> night. The animation itself is CSS (tokens.css timings + the stage's sun/moon). */
export function toggleTheme() {
	theme.dark = !theme.dark;
	const t = theme.dark ? 'dark' : 'light';
	document.documentElement.dataset.theme = t;
	try {
		localStorage.setItem('theme', t);
	} catch {
		/* private mode: the choice just isn't remembered */
	}
}
