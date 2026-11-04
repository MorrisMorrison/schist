import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

const state = vi.hoisted(() => ({ settings: { mode: 'backup', enabled: true } }));

vi.mock('#lib/stores/github.svelte.ts', () => ({
	githubStore: state,
	githubActions: {
		previewSync: vi.fn(),
		updateSettings: vi.fn().mockResolvedValue({}),
		syncToGitHub: vi.fn().mockResolvedValue({ success: true })
	}
}));

import { githubActions } from '#lib/stores/github.svelte.ts';
import SyncModeSetting from './SyncModeSetting.svelte';

describe('SyncModeSetting', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		state.settings.mode = 'backup';
	});
	afterEach(() => cleanup());

	it('previews before switching to two-way, and switches on confirm', async () => {
		vi.mocked(githubActions.previewSync).mockResolvedValue({
			incoming: [
				{ path: 'new.md', action: 'add', page: true },
				{ path: 'gone.md', action: 'delete', page: true },
				{ path: 'edited.md', action: 'change', page: true }
			],
			outgoing: ['mine.md'],
			conflicts: ['plan.md'],
			unreadable: [],
			remote_head: 'abc'
		});
		render(SyncModeSetting);

		await userEvent.click(screen.getByTestId('sync-mode-two-way'));
		const dialog = await screen.findByTestId('sync-preview-dialog');
		expect(within(dialog).getByText('new.md')).toBeVisible();
		expect(within(dialog).getByText('plan.md')).toBeVisible();
		expect(within(dialog).getByText('gone.md')).toBeVisible();
		expect(within(dialog).getByText('Deleted from the wiki (1)')).toBeVisible();
		expect(githubActions.updateSettings).not.toHaveBeenCalled();

		await userEvent.click(within(dialog).getByRole('button', { name: 'Turn on two-way sync' }));
		expect(githubActions.updateSettings).toHaveBeenCalledWith({ mode: 'two-way' });
		expect(githubActions.syncToGitHub).toHaveBeenCalled();
	});

	it('changes nothing when the preview is cancelled', async () => {
		vi.mocked(githubActions.previewSync).mockResolvedValue({
			incoming: [],
			outgoing: [],
			conflicts: [],
			unreadable: [],
			remote_head: 'abc'
		});
		render(SyncModeSetting);

		await userEvent.click(screen.getByTestId('sync-mode-two-way'));
		const dialog = await screen.findByTestId('sync-preview-dialog');
		await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
		expect(githubActions.updateSettings).not.toHaveBeenCalled();
	});

	it('switches back to backup without a preview', async () => {
		state.settings.mode = 'two-way';
		render(SyncModeSetting);

		await userEvent.click(screen.getByTestId('sync-mode-backup'));
		expect(githubActions.previewSync).not.toHaveBeenCalled();
		expect(githubActions.updateSettings).toHaveBeenCalledWith({ mode: 'backup' });
	});

	it('shows an error when the preview fails', async () => {
		vi.mocked(githubActions.previewSync).mockRejectedValue(new Error('nope'));
		render(SyncModeSetting);

		await userEvent.click(screen.getByTestId('sync-mode-two-way'));
		expect(await screen.findByRole('alert')).toBeVisible();
		expect(screen.queryByTestId('sync-preview-dialog')).toBeNull();
	});
});
