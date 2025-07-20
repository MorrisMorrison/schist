import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type Theme = 'light' | 'dark';

function getSystemTheme(): 'light' | 'dark' {
	if (!browser) return 'dark';

	if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
		return 'dark';
	}
	return 'light';
}

function getInitialTheme(): Theme {
	if (!browser) return 'dark';

	const stored = localStorage.getItem('theme') as Theme;
	if (stored && ['light', 'dark'].includes(stored)) {
		return stored;
	}
	return getSystemTheme();
}

export const theme = writable<Theme>(getInitialTheme());

theme.subscribe((currentTheme) => {
	if (browser) {
		localStorage.setItem('theme', currentTheme);

		document.documentElement.classList.toggle('dark', currentTheme === 'dark');
	}
});

if (browser) {
	theme.update((currentTheme) => {
		document.documentElement.classList.toggle('dark', currentTheme === 'dark');
		return currentTheme;
	});
}

export const themeActions = {
	setTheme: (newTheme: Theme) => {
		theme.set(newTheme);
	},

	toggleTheme: () => {
		theme.update((currentTheme) => {
			return currentTheme === 'dark' ? 'light' : 'dark';
		});
	}
};
