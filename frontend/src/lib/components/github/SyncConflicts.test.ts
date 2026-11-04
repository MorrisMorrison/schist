import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

type MockSettings = {
	mode: string;
	sync_conflicts: string[];
	paused_remote_head: string;
	unreadable: string[];
};
const holder = vi.hoisted(() => ({ store: null as unknown as { settings: MockSettings } }));

vi.mock('#lib/stores/github.svelte.ts', async () => {
	// Reactive, so a test can change the settings the way a refresh would.
	const { reactive } = await import('#lib/test/reactive.svelte.ts');
	holder.store = reactive({
		settings: {
			mode: 'two-way',
			sync_conflicts: ['plan.md', 'notes/a.md'],
			paused_remote_head: 'abc',
			unreadable: ['My Note.md']
		}
	});
	return {
		githubStore: holder.store,
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
	};
});

import { tick } from 'svelte';
import { githubActions } from '#lib/stores/github.svelte.ts';
import SyncConflicts from './SyncConflicts.svelte';

const state = holder.store;

/** The 409 a resume gets when the sync paused again. */
function pausedAgain(conflicts: string[], remoteHead: string) {
	return new Error(
		JSON.stringify({
			error: 'paused',
			code: 'SYNC_CONFLICT',
			details: { conflicts, remote_head: remoteHead }
		})
	);
}

describe('SyncConflicts', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		state.settings.sync_conflicts = ['plan.md', 'notes/a.md'];
		state.settings.paused_remote_head = 'abc';
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
		expect(screen.getByText('Pick a side for every page to resume.')).toBeVisible();
		await userEvent.click(
			within(rows[0]).getByRole('button', { name: "Keep Schist's version of plan.md" })
		);
		await userEvent.click(
			within(rows[1]).getByRole('button', { name: "Take GitHub's version of notes/a.md" })
		);
		expect(resume).toBeEnabled();
		expect(screen.queryByText('Pick a side for every page to resume.')).toBeNull();
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
		const toggle = screen.getByRole('button', { name: 'plan.md' });
		expect(toggle).toHaveAttribute('type', 'button');
		expect(toggle).toHaveAttribute('aria-expanded', 'false');
		await userEvent.click(toggle);
		expect(githubActions.loadConflict).toHaveBeenCalledWith('plan.md');
		expect(await screen.findByTestId('sync-conflict-diff')).toBeVisible();
		expect(toggle).toHaveAttribute('aria-expanded', 'true');
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

	it('drops the picks and closes the diff when GitHub changed again in the background', async () => {
		render(SyncConflicts);
		await userEvent.click(screen.getByRole('button', { name: 'All Schist' }));
		await userEvent.click(screen.getByRole('button', { name: 'plan.md' }));
		expect(await screen.findByTestId('sync-conflict-diff')).toBeVisible();

		// A background sync paused again at a newer GitHub head.
		state.settings.paused_remote_head = 'def';
		await tick();

		expect(screen.queryByTestId('sync-conflict-diff')).toBeNull();
		expect(screen.getByText(/GitHub changed again/)).toBeVisible();
		const resume = screen.getByRole('button', { name: 'Resume sync' });
		expect(resume).toBeDisabled();

		await userEvent.click(screen.getByRole('button', { name: 'All GitHub' }));
		await userEvent.click(resume);
		expect(githubActions.syncToGitHub).toHaveBeenCalledWith({
			resolutions: { 'plan.md': 'remote', 'notes/a.md': 'remote' },
			remoteHead: 'def'
		});
	});

	it('keeps the picks the server still accepts when a resume pauses again', async () => {
		vi.mocked(githubActions.syncToGitHub).mockImplementationOnce(async () => {
			// What the store's refresh brings: only the re-conflicted page, at the new head.
			state.settings.sync_conflicts = ['notes/a.md'];
			state.settings.paused_remote_head = 'def';
			throw pausedAgain(['notes/a.md'], 'def');
		});
		render(SyncConflicts);
		let rows = screen.getAllByTestId('sync-conflict-row');
		await userEvent.click(within(rows[0]).getByRole('button', { name: /Keep Schist's/ }));
		await userEvent.click(within(rows[1]).getByRole('button', { name: /Take GitHub's/ }));
		await userEvent.click(screen.getByRole('button', { name: 'Resume sync' }));

		// plan.md's pick stands and is shown as decided; notes/a.md asks again.
		expect(screen.queryByText(/GitHub changed again/)).toBeNull();
		const decided = await screen.findByTestId('sync-decided-row');
		expect(within(decided).getByText('plan.md')).toBeVisible();
		expect(within(decided).getByRole('button', { name: /Keep Schist's/ })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		rows = screen.getAllByTestId('sync-conflict-row');
		expect(rows).toHaveLength(1);
		expect(within(rows[0]).getByRole('button', { name: /Take GitHub's/ })).toHaveAttribute(
			'aria-pressed',
			'false'
		);
		const resume = screen.getByRole('button', { name: 'Resume sync' });
		expect(resume).toBeDisabled();

		await userEvent.click(within(rows[0]).getByRole('button', { name: /Keep Schist's/ }));
		await userEvent.click(resume);
		expect(githubActions.syncToGitHub).toHaveBeenLastCalledWith({
			resolutions: { 'plan.md': 'local', 'notes/a.md': 'local' },
			remoteHead: 'def'
		});
	});

	it('lists notes Schist cannot read', () => {
		render(SyncConflicts);
		expect(screen.getByText('My Note.md')).toBeVisible();
	});
});
