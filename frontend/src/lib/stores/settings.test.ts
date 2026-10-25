import { describe, it, expect, vi, afterEach } from 'vitest';

const KEY = 'schist_settings';

// Settings are read once at import, so each scenario loads a fresh module copy.
let copy = 0;
async function loadSettings() {
	const url = `./settings.svelte.ts?copy=${++copy}`;
	return (await import(/* @vite-ignore */ url)) as typeof import('./settings.svelte');
}

describe('settings store', () => {
	afterEach(() => {
		localStorage.removeItem(KEY);
		vi.restoreAllMocks();
	});

	it('starts with defaults', async () => {
		const { settings } = await loadSettings();

		expect(settings.app).toEqual({ alwaysHidePreview: false, alwaysOpenFullscreen: false });
	});

	it('merges stored settings over the defaults', async () => {
		localStorage.setItem(KEY, JSON.stringify({ app: { alwaysOpenFullscreen: true } }));

		const { settings } = await loadSettings();

		expect(settings.app).toEqual({ alwaysHidePreview: false, alwaysOpenFullscreen: true });
	});

	it('ignores corrupt stored settings', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		localStorage.setItem(KEY, '{nope');

		const { settings } = await loadSettings();

		expect(settings.app.alwaysHidePreview).toBe(false);
		expect(console.warn).toHaveBeenCalled();
	});

	it('updates one setting and persists the whole object', async () => {
		const { settings, settingsActions } = await loadSettings();

		settingsActions.updateAppSetting('alwaysHidePreview', true);

		expect(settings.app).toEqual({ alwaysHidePreview: true, alwaysOpenFullscreen: false });
		expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({
			app: { alwaysHidePreview: true, alwaysOpenFullscreen: false }
		});
	});

	it('logs instead of throwing when storage is full', async () => {
		const { settings, settingsActions } = await loadSettings();
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new Error('quota');
		});

		settingsActions.updateAppSetting('alwaysOpenFullscreen', true);

		expect(settings.app.alwaysOpenFullscreen).toBe(true);
		expect(console.error).toHaveBeenCalled();
	});
});
