import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('#lib/api/client.ts', () => ({
	apiClient: { listUsers: vi.fn() }
}));

import { apiClient } from '#lib/api/client.ts';
import { workspaceStore } from './workspace.svelte';

const api = vi.mocked(apiClient);
const user = (username: string) => ({ username }) as never;

beforeEach(() => {
	vi.clearAllMocks();
	vi.spyOn(console, 'warn').mockImplementation(() => {});
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('workspace store', () => {
	beforeEach(() => workspaceStore.reset());

	it('counts users and flags a shared workspace', async () => {
		api.listUsers.mockResolvedValueOnce({ users: [user('a'), user('b')] });

		await workspaceStore.loadUsers();

		expect(workspaceStore.userCount).toBe(2);
		expect(workspaceStore.isSharedWorkspace).toBe(true);
		expect(workspaceStore.users).toHaveLength(2);
		expect(workspaceStore.loading).toBe(false);
	});

	it('treats a single user or a missing list as not shared', async () => {
		api.listUsers.mockResolvedValueOnce({ users: [user('a')] });
		await workspaceStore.loadUsers();
		expect(workspaceStore.isSharedWorkspace).toBe(false);

		api.listUsers.mockResolvedValueOnce({} as never);
		await workspaceStore.loadUsers();
		expect(workspaceStore.userCount).toBe(0);
	});

	it('records a failure without throwing', async () => {
		api.listUsers.mockRejectedValueOnce(new Error('{"error":"no","code":"FORBIDDEN"}'));

		await expect(workspaceStore.loadUsers()).resolves.toBeUndefined();
		expect(workspaceStore.error).toBe('Failed to load workspace information');
		expect(workspaceStore.loading).toBe(false);

		workspaceStore.reset();
		expect(workspaceStore.error).toBeNull();
	});
});
