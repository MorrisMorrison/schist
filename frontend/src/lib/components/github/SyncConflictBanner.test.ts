import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';

const state = vi.hoisted(() => ({
	settings: { sync_conflicts: ['notes/plan.md'] } as { sync_conflicts: string[] } | null
}));

vi.mock('#lib/stores/github.svelte.ts', () => ({
	githubStore: state,
	githubActions: { loadGitHubSettings: vi.fn().mockResolvedValue({}), clearError: vi.fn() }
}));
import { githubActions } from '#lib/stores/github.svelte.ts';
import SyncConflictBanner from './SyncConflictBanner.svelte';

describe('SyncConflictBanner', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		state.settings = { sync_conflicts: ['notes/plan.md'] };
	});
	afterEach(() => cleanup());

	it('shows on a page waiting for a side', () => {
		render(SyncConflictBanner, { props: { path: '/notes/plan' } });
		expect(screen.getByTestId('sync-conflict-banner')).toBeVisible();
		expect(githubActions.loadGitHubSettings).not.toHaveBeenCalled();
	});

	it('stays away elsewhere', () => {
		render(SyncConflictBanner, { props: { path: '/notes/other' } });
		expect(screen.queryByTestId('sync-conflict-banner')).toBeNull();
	});

	it('loads the settings once when none are loaded, ignoring failures', async () => {
		state.settings = null;
		vi.mocked(githubActions.loadGitHubSettings).mockRejectedValue(new Error('nope'));
		render(SyncConflictBanner, { props: { path: '/a' } });
		cleanup();
		render(SyncConflictBanner, { props: { path: '/b' } });
		expect(githubActions.loadGitHubSettings).toHaveBeenCalledTimes(1);
		expect(screen.queryByTestId('sync-conflict-banner')).toBeNull();
	});
});
