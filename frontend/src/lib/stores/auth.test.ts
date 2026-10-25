import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('$lib/api/client', () => ({ apiClient: { setAuthToken: vi.fn() } }));

import { apiClient } from '$lib/api/client';

const KEY = 'schist_auth_token';
const user = { username: 'alice', created_at: '', last_login: '' };

// The token is read once at import, so each scenario loads a fresh module copy.
let copy = 0;
async function loadAuthStore() {
	const url = `./auth.svelte.ts?copy=${++copy}`;
	return (await import(/* @vite-ignore */ url)) as typeof import('./auth.svelte');
}

describe('auth store', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		localStorage.removeItem(KEY);
	});

	afterEach(() => {
		localStorage.removeItem(KEY);
		vi.restoreAllMocks();
	});

	it('restores a stored token and hands it to the API client', async () => {
		localStorage.setItem(KEY, 'stored');

		const { authStore } = await loadAuthStore();

		expect(authStore.token).toBe('stored');
		expect(authStore.isAuthenticated).toBe(false); // no user yet
		expect(apiClient.setAuthToken).toHaveBeenCalledWith('stored');
	});

	it('starts signed out without a token, and survives unreadable storage', async () => {
		expect((await loadAuthStore()).authStore.token).toBeNull();
		expect(apiClient.setAuthToken).not.toHaveBeenCalled();

		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
			throw new Error('denied');
		});
		expect((await loadAuthStore()).authStore.token).toBeNull();
		expect(console.warn).toHaveBeenCalled();
	});

	it('setAuth persists the token, syncs the client and clears loading/error', async () => {
		const { authStore, authActions } = await loadAuthStore();
		authActions.setLoading(true);
		authActions.setError('old');

		authActions.setAuth('jwt', user);

		expect(authStore.token).toBe('jwt');
		expect(authStore.user).toEqual(user);
		expect(authStore.isAuthenticated).toBe(true);
		expect(authStore.isLoading).toBe(false);
		expect(authStore.error).toBeNull();
		expect(localStorage.getItem(KEY)).toBe('jwt');
		expect(apiClient.setAuthToken).toHaveBeenLastCalledWith('jwt');
	});

	it('clearAuth removes the token everywhere', async () => {
		const { authStore, authActions } = await loadAuthStore();
		authActions.setAuth('jwt', user);

		authActions.clearAuth();

		expect(authStore.token).toBeNull();
		expect(authStore.user).toBeNull();
		expect(localStorage.getItem(KEY)).toBeNull();
		expect(apiClient.setAuthToken).toHaveBeenLastCalledWith(null);
	});

	it('tracks loading, errors and user updates', async () => {
		const { authStore, authActions } = await loadAuthStore();

		authActions.setError('nope');
		authActions.setLoading(true);
		expect(authStore.isLoading).toBe(true);
		expect(authStore.error).toBeNull(); // starting a load clears the error

		authActions.setError('failed');
		expect(authStore.isLoading).toBe(false);
		expect(authStore.error).toBe('failed');
		authActions.clearError();
		expect(authStore.error).toBeNull();

		authActions.setLoading(true);
		authActions.updateUser(user);
		expect(authStore.user).toEqual(user);
		expect(authStore.isLoading).toBe(false);
	});

	it('logs instead of throwing when the token cannot be saved', async () => {
		const { authStore, authActions } = await loadAuthStore();
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new Error('quota');
		});

		authActions.setAuth('jwt', user);

		expect(authStore.token).toBe('jwt');
		expect(console.error).toHaveBeenCalled();
	});
});
