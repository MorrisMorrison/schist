import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { settings, settingsActions } from '$lib/stores/settings.svelte';
import EditorSettingsSection from './EditorSettingsSection.svelte';

describe('EditorSettingsSection', () => {
	afterEach(() => {
		cleanup();
		settingsActions.updateAppSetting('alwaysHidePreview', false);
		settingsActions.updateAppSetting('alwaysOpenFullscreen', false);
		localStorage.removeItem('schist_settings');
	});

	function switches() {
		return screen.getAllByRole('switch');
	}

	it('renders both settings reflecting the store', () => {
		settingsActions.updateAppSetting('alwaysOpenFullscreen', true);
		render(EditorSettingsSection);
		expect(screen.getByTestId('editor-settings-section')).toBeInTheDocument();
		expect(screen.getByText('Always hide preview')).toBeInTheDocument();
		expect(screen.getByText('Always open editor in fullscreen mode')).toBeInTheDocument();
		const [hidePreview, fullscreen] = switches();
		expect(hidePreview).toHaveAttribute('aria-checked', 'false');
		expect(fullscreen).toHaveAttribute('aria-checked', 'true');
	});

	it('toggles "always hide preview" and persists it', async () => {
		render(EditorSettingsSection);
		await userEvent.click(switches()[0]);
		expect(settings.app.alwaysHidePreview).toBe(true);
		expect(switches()[0]).toHaveAttribute('aria-checked', 'true');
		expect(JSON.parse(localStorage.getItem('schist_settings')!).app.alwaysHidePreview).toBe(true);
	});

	it('toggles "always open fullscreen"', async () => {
		render(EditorSettingsSection);
		await userEvent.click(switches()[1]);
		expect(settings.app.alwaysOpenFullscreen).toBe(true);
		await userEvent.click(switches()[1]);
		expect(settings.app.alwaysOpenFullscreen).toBe(false);
	});
});
