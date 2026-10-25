import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';

vi.mock('$lib/api/client', () => ({
	apiClient: { listUsers: vi.fn(), setAuthToken: vi.fn() }
}));

import { apiClient } from '$lib/api/client';
import type { UserInfo } from '$lib/api/types';
import { authActions } from '$lib/stores/auth.svelte';
import { workspaceStore } from '$lib/stores/workspace.svelte';
import WorkspaceIndicator from './WorkspaceIndicator.svelte';

const user = { username: 'ada', created_at: '', last_login: '' };
const users = (n: number) =>
	Array.from({ length: n }, (_, i) => ({ username: `u${i}` }) as unknown as UserInfo);

describe('WorkspaceIndicator', () => {
	afterEach(() => {
		cleanup();
		authActions.clearAuth();
		workspaceStore.reset();
		vi.clearAllMocks();
	});

	it('shows the user count in a shared workspace', async () => {
		vi.mocked(apiClient.listUsers).mockResolvedValue({ users: users(3) });
		authActions.setAuth('token', user);

		render(WorkspaceIndicator);

		expect(await screen.findByTestId('workspace-indicator')).toHaveTextContent(
			'Shared Workspace • 3 users'
		);
	});

	it('stays hidden for a single-user workspace', async () => {
		vi.mocked(apiClient.listUsers).mockResolvedValue({ users: users(1) });
		authActions.setAuth('token', user);

		render(WorkspaceIndicator);

		await vi.waitFor(() => expect(apiClient.listUsers).toHaveBeenCalled());
		expect(screen.queryByTestId('workspace-indicator')).not.toBeInTheDocument();
	});

	it('does not load users when signed out', () => {
		render(WorkspaceIndicator);

		expect(apiClient.listUsers).not.toHaveBeenCalled();
		expect(screen.queryByTestId('workspace-indicator')).not.toBeInTheDocument();
	});
});
