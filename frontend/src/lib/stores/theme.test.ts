import { describe, it, expect, vi, afterEach } from 'vitest';

// The theme is read once at import, so each scenario loads a fresh module copy.
let copy = 0;
async function loadThemeStore() {
	const url = `./theme.svelte.ts?copy=${++copy}`;
	return (await import(/* @vite-ignore */ url)) as typeof import('./theme.svelte');
}

function prefersDark(dark: boolean) {
	vi.spyOn(window, 'matchMedia').mockImplementation(
		(query: string) => ({ matches: dark && query.includes('dark') }) as MediaQueryList
	);
}

describe('theme store', () => {
	afterEach(() => {
		localStorage.removeItem('theme');
		document.documentElement.classList.remove('dark');
		vi.restoreAllMocks();
	});

	it('starts from the stored theme', async () => {
		prefersDark(false);
		localStorage.setItem('theme', 'dark');

		const { themeStore } = await loadThemeStore();

		expect(themeStore.current).toBe('dark');
		expect(document.documentElement.classList.contains('dark')).toBe(true);
	});

	it('falls back to the system preference when nothing valid is stored', async () => {
		localStorage.setItem('theme', 'purple');
		prefersDark(true);
		expect((await loadThemeStore()).themeStore.current).toBe('dark');

		localStorage.removeItem('theme');
		prefersDark(false);
		expect((await loadThemeStore()).themeStore.current).toBe('light');
		expect(localStorage.getItem('theme')).toBe('light');
	});

	it('sets and toggles the theme, persisting it and updating the root class', async () => {
		prefersDark(false);
		const { themeStore, themeActions } = await loadThemeStore();

		themeActions.setTheme('dark');
		expect(themeStore.current).toBe('dark');
		expect(localStorage.getItem('theme')).toBe('dark');
		expect(document.documentElement.classList.contains('dark')).toBe(true);

		themeActions.toggleTheme();
		expect(themeStore.current).toBe('light');
		expect(localStorage.getItem('theme')).toBe('light');
		expect(document.documentElement.classList.contains('dark')).toBe(false);

		themeStore.toggle();
		expect(themeStore.current).toBe('dark');
	});
});
