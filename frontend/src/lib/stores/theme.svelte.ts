export type Theme = 'light' | 'dark';

function getSystemTheme(): 'light' | 'dark' {
	if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
		return 'dark';
	}
	return 'light';
}

function getInitialTheme(): Theme {
	const stored = localStorage.getItem('theme') as Theme;
	if (stored && ['light', 'dark'].includes(stored)) {
		return stored;
	}
	return getSystemTheme();
}

function createThemeStore() {
	const initialTheme = getInitialTheme();
	let currentTheme = $state<Theme>(initialTheme);

	// Function to apply theme changes
	function applyTheme(theme: Theme) {
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem('theme', theme);
		}
		if (typeof document !== 'undefined') {
			document.documentElement.classList.toggle('dark', theme === 'dark');
		}
	}

	// Apply initial theme
	applyTheme(initialTheme);

	return {
		get current() {
			return currentTheme;
		},
		set: (newTheme: Theme) => {
			currentTheme = newTheme;
			applyTheme(newTheme);
		},
		toggle: () => {
			const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
			currentTheme = newTheme;
			applyTheme(newTheme);
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
