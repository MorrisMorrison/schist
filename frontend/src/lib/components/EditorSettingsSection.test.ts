import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { settings, settingsActions } from '#lib/stores/settings.svelte.ts';
import EditorSettingsSection from './EditorSettingsSection.svelte';

describe('EditorSettingsSection', () => {
	afterEach(() => {
		cleanup();
		settingsActions.updateAppSetting('openDocumentsInEditMode', false);
		settingsActions.updateAppSetting('alwaysOpenFullscreen', false);
		settingsActions.updateAppSetting('fullWidthDocuments', false);
		localStorage.removeItem('schist_settings');
	});

	function switches() {
		return screen.getAllByRole('switch');
	}

	it('renders every setting reflecting the store', () => {
		settingsActions.updateAppSetting('alwaysOpenFullscreen', true);
		render(EditorSettingsSection);
		expect(screen.getByTestId('editor-settings-section')).toBeInTheDocument();
		expect(screen.getByText('Open documents in edit mode')).toBeInTheDocument();
		expect(screen.getByText('Always edit in focus mode')).toBeInTheDocument();
		expect(screen.getByText('Full-width documents')).toBeInTheDocument();
		const [editMode, fullscreen, fullWidth] = switches();
		expect(editMode).toHaveAttribute('aria-checked', 'false');
		expect(fullscreen).toHaveAttribute('aria-checked', 'true');
		expect(fullWidth).toHaveAttribute('aria-checked', 'false');
	});

	it('toggles "open documents in edit mode" and persists it', async () => {
		render(EditorSettingsSection);
		await userEvent.click(switches()[0]);
		expect(settings.app.openDocumentsInEditMode).toBe(true);
		expect(switches()[0]).toHaveAttribute('aria-checked', 'true');
		expect(JSON.parse(localStorage.getItem('schist_settings')!).app.openDocumentsInEditMode).toBe(
			true
		);
	});

	it('toggles "always edit in focus mode"', async () => {
		render(EditorSettingsSection);
		await userEvent.click(switches()[1]);
		expect(settings.app.alwaysOpenFullscreen).toBe(true);
		await userEvent.click(switches()[1]);
		expect(settings.app.alwaysOpenFullscreen).toBe(false);
	});

	it('toggles "full-width documents"', async () => {
		render(EditorSettingsSection);
		await userEvent.click(switches()[2]);
		expect(settings.app.fullWidthDocuments).toBe(true);
		expect(JSON.parse(localStorage.getItem('schist_settings')!).app.fullWidthDocuments).toBe(true);
	});
});
