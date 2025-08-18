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

function createThemeStore() {
	let currentTheme = $state<Theme>(getInitialTheme());

	if (browser) {
		$effect(() => {
			localStorage.setItem('theme', currentTheme);
			document.documentElement.classList.toggle('dark', currentTheme === 'dark');
		});
	}

	return {
		get current() {
			return currentTheme;
		},
		set: (newTheme: Theme) => {
			currentTheme = newTheme;
		},
		toggle: () => {
			currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
		}
	};
}

export const themeStore = createThemeStore();

// Export actions for backward compatibility and cleaner API
export const themeActions = {
	setTheme: (newTheme: Theme) => {
		themeStore.set(newTheme);
	},

	toggleTheme: () => {
		themeStore.toggle();
	}
};
