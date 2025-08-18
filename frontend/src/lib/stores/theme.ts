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

// Svelte 5 runes-based theme store state
let currentTheme = $state<Theme>(getInitialTheme());

// Effect to persist theme to localStorage and update DOM
$effect(() => {
	if (browser) {
		localStorage.setItem('theme', currentTheme);
		document.documentElement.classList.toggle('dark', currentTheme === 'dark');
	}
});

// Export the reactive state directly for use in components
export const theme = {
	get current() {
		return currentTheme;
	}
};

export const themeActions = {
	setTheme: (newTheme: Theme) => {
		currentTheme = newTheme;
	},

	toggleTheme: () => {
		currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
	}
};
