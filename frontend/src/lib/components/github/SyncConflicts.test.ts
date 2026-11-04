import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

const state = vi.hoisted(() => ({
	settings: {
		mode: 'two-way',
		sync_conflicts: ['plan.md', 'notes/a.md'],
		paused_remote_head: 'abc',
		unreadable: ['My Note.md']
	}
}));

vi.mock('#lib/stores/github.svelte.ts', () => ({
	githubStore: state,
	githubActions: {
		loadConflict: vi.fn().mockResolvedValue({
			path: 'plan.md',
			local: 'L',
			remote: 'R',
			diff: {
				path: '/plan',
				hash1: 'schist',
				hash2: 'github',
				lines: [],
				summary: { additions: 0, deletions: 0, modifications: 0 }
			}
		}),
		syncToGitHub: vi.fn().mockResolvedValue({ success: true })
	}
}));

import { githubActions } from '#lib/stores/github.svelte.ts';
import SyncConflicts from './SyncConflicts.svelte';

describe('SyncConflicts', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		state.settings.sync_conflicts = ['plan.md', 'notes/a.md'];
	});
	afterEach(() => cleanup());

	it('resumes only when every page has a side, sending the choices', async () => {
		render(SyncConflicts);
		expect(
			screen.getByText('Sync paused: 2 pages changed in both Schist and GitHub')
		).toBeVisible();
		const resume = screen.getByRole('button', { name: 'Resume sync' });
		expect(resume).toBeDisabled();

		const rows = screen.getAllByTestId('sync-conflict-row');
		await userEvent.click(within(rows[0]).getByRole('button', { name: "Keep Schist's" }));
		await userEvent.click(within(rows[1]).getByRole('button', { name: "Take GitHub's" }));
		expect(resume).toBeEnabled();
		await userEvent.click(resume);

		expect(githubActions.syncToGitHub).toHaveBeenCalledWith({
			resolutions: { 'plan.md': 'local', 'notes/a.md': 'remote' },
			remoteHead: 'abc'
		});
	});

	it('All GitHub picks a side for every page', async () => {
		render(SyncConflicts);
		await userEvent.click(screen.getByRole('button', { name: 'All GitHub' }));
		await userEvent.click(screen.getByRole('button', { name: 'Resume sync' }));
		expect(githubActions.syncToGitHub).toHaveBeenCalledWith({
			resolutions: { 'plan.md': 'remote', 'notes/a.md': 'remote' },
			remoteHead: 'abc'
		});
	});

	it('shows the diff of a page on click', async () => {
		render(SyncConflicts);
		await userEvent.click(screen.getByRole('button', { name: 'plan.md' }));
		expect(githubActions.loadConflict).toHaveBeenCalledWith('plan.md');
		expect(await screen.findByTestId('sync-conflict-diff')).toBeVisible();
	});

	it('does not show a new pause as an error, but shows other failures', async () => {
		vi.mocked(githubActions.syncToGitHub).mockRejectedValueOnce(
			new Error(JSON.stringify({ error: 'paused', code: 'SYNC_CONFLICT' }))
		);
		render(SyncConflicts);
		await userEvent.click(screen.getByRole('button', { name: 'All Schist' }));
		await userEvent.click(screen.getByRole('button', { name: 'Resume sync' }));
		expect(screen.queryByRole('alert')).toBeNull();

		vi.mocked(githubActions.syncToGitHub).mockRejectedValueOnce(new Error('boom'));
		await userEvent.click(screen.getByRole('button', { name: 'All Schist' }));
		await userEvent.click(screen.getByRole('button', { name: 'Resume sync' }));
		expect(await screen.findByRole('alert')).toBeVisible();
	});

	it('keeps the picks after a failed resume', async () => {
		vi.mocked(githubActions.syncToGitHub).mockRejectedValueOnce(new Error('boom'));
		render(SyncConflicts);
		await userEvent.click(screen.getByRole('button', { name: 'All Schist' }));
		await userEvent.click(screen.getByRole('button', { name: 'Resume sync' }));
		expect(await screen.findByRole('alert')).toBeVisible();
		expect(screen.getByRole('button', { name: 'Resume sync' })).toBeEnabled();
	});

	it('ignores a diff that resolves after a later request', async () => {
		const diff = (path: string) => ({
			path,
			local: '',
			remote: '',
			diff: {
				path: '/x',
				hash1: 'schist',
				hash2: 'github',
				lines: [],
				summary: { additions: 0, deletions: 0, modifications: 0 }
			}
		});
		let resolveFirst: (v: ReturnType<typeof diff>) => void = () => {};
		vi.mocked(githubActions.loadConflict)
			.mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)) as never)
			.mockResolvedValueOnce(diff('notes/a.md') as never);
		render(SyncConflicts);
		await userEvent.click(screen.getByRole('button', { name: 'plan.md' }));
		await userEvent.click(screen.getByRole('button', { name: 'notes/a.md' }));
		expect(await screen.findByTestId('sync-conflict-diff')).toBeVisible();
		resolveFirst(diff('plan.md'));
		await new Promise((r) => setTimeout(r, 20));
		const rows = screen.getAllByTestId('sync-conflict-row');
		expect(within(rows[0]).queryByTestId('sync-conflict-diff')).toBeNull();
		expect(within(rows[1]).getByTestId('sync-conflict-diff')).toBeVisible();
	});

	it('lists notes Schist cannot read', () => {
		render(SyncConflicts);
		expect(screen.getByText('My Note.md')).toBeVisible();
	});
});
