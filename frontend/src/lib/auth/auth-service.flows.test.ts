import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AppConfig, User } from '#lib/api/types.ts';

vi.mock('#lib/api/client.ts', () => ({
	apiClient: {
		setAuthToken: vi.fn(),
		getConfig: vi.fn(),
		getCurrentUser: vi.fn(),
		checkSetupRequired: vi.fn(),
		loginWithPasskey: vi.fn(),
		logout: vi.fn()
	}
}));

vi.mock('#lib/stores/secrets.svelte.ts', () => ({
	secretStore: {
		status: null as null | { unlocked: boolean },
		loadStatus: vi.fn(),
		loadSecrets: vi.fn()
	}
}));

import { goto } from '$app/navigation';
import { apiClient } from '#lib/api/client.ts';
import { authActions, authStore } from '#lib/stores/auth.svelte.ts';
import { secretStore } from '#lib/stores/secrets.svelte.ts';
import { authService } from './auth-service';

const user = { username: 'alice', created_at: '', last_login: '' } as User;
const apiError = (error: string, code: string) => new Error(JSON.stringify({ error, code }));
const secrets = secretStore as unknown as {
	status: null | { unlocked: boolean };
	loadStatus: ReturnType<typeof vi.fn>;
	loadSecrets: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
	vi.clearAllMocks();
	vi.spyOn(console, 'warn').mockImplementation(() => {});
	vi.mocked(apiClient.getConfig).mockResolvedValue({ auth_enabled: true } as AppConfig);
	vi.mocked(apiClient.checkSetupRequired).mockResolvedValue({ requires_setup: false });
	authActions.clearAuth();
});

afterEach(() => {
	vi.restoreAllMocks();
	authActions.clearAuth();
});

describe('authService flows', () => {
	beforeEach(async () => {
		await authService.initialize();
		vi.clearAllMocks();
	});

	describe('loginWithPasskey', () => {
		it('stores the session and syncs unlocked secrets', async () => {
			vi.mocked(apiClient.loginWithPasskey).mockResolvedValueOnce({ token: 'jwt', user } as never);
			secrets.status = { unlocked: true };

			await authService.loginWithPasskey('ticket');

			expect(apiClient.loginWithPasskey).toHaveBeenCalledWith('ticket');
			expect(authStore.token).toBe('jwt');
			expect(authStore.user).toEqual(user);
			expect(authStore.isAuthenticated).toBe(true);
			expect(authStore.isLoading).toBe(false);
			expect(secrets.loadStatus).toHaveBeenCalled();
			expect(secrets.loadSecrets).toHaveBeenCalled();
		});

		it('skips loading secrets while they are locked, and survives a failed sync', async () => {
			vi.mocked(apiClient.loginWithPasskey).mockResolvedValue({ token: 'jwt', user } as never);
			secrets.status = { unlocked: false };
			await authService.loginWithPasskey('ticket');
			expect(secrets.loadSecrets).not.toHaveBeenCalled();

			secrets.loadStatus.mockRejectedValueOnce(new Error('locked'));
			await expect(authService.loginWithPasskey('ticket')).resolves.toBeDefined();
			expect(authStore.token).toBe('jwt');
		});

		it('sets a friendly error and rethrows when login fails', async () => {
			const failure = apiError('bad ticket', 'UNAUTHORIZED');
			vi.mocked(apiClient.loginWithPasskey).mockRejectedValueOnce(failure);

			await expect(authService.loginWithPasskey('ticket')).rejects.toBe(failure);

			expect(authStore.error).toBe('Passkey authentication failed. Please try again.');
			expect(authStore.token).toBeNull();
			expect(authStore.isLoading).toBe(false);
		});
	});

	it('logout clears the session and goes to /login even if the request fails', async () => {
		authActions.setAuth('token', user);
		vi.mocked(apiClient.logout).mockRejectedValueOnce(new Error('offline'));

		await authService.logout();

		expect(authStore.token).toBeNull();
		expect(localStorage.getItem('schist_auth_token')).toBeNull();
		expect(goto).toHaveBeenCalledWith('/login');
	});

	it('checkAuthStatus is false without a token and shares one in-flight check', async () => {
		await expect(authService.checkAuthStatus()).resolves.toBe(false);
		expect(apiClient.getCurrentUser).not.toHaveBeenCalled();

		authActions.setAuth('token', user);
		vi.mocked(apiClient.getCurrentUser).mockResolvedValue(user);
		const results = await Promise.all([
			authService.checkAuthStatus(),
			authService.checkAuthStatus()
		]);
		expect(results).toEqual([true, true]);
		expect(apiClient.getCurrentUser).toHaveBeenCalledTimes(1);
	});

	describe('requireAuth', () => {
		it('allows public routes without checking', async () => {
			await expect(authService.requireAuth('/share/abc')).resolves.toBe(true);
			await expect(authService.requireAuth('/setup')).resolves.toBe(true);
			expect(apiClient.getCurrentUser).not.toHaveBeenCalled();
		});

		it('allows an authenticated user', async () => {
			authActions.setAuth('token', user);
			vi.mocked(apiClient.getCurrentUser).mockResolvedValueOnce(user);

			await expect(authService.requireAuth('/documents/a')).resolves.toBe(true);
			expect(goto).not.toHaveBeenCalled();
		});

		it('sends an anonymous user to login with the return URL', async () => {
			await expect(authService.requireAuth('/documents/a')).resolves.toBe(false);
			expect(goto).toHaveBeenCalledWith('/login?returnUrl=%2Fdocuments%2Fa');
		});

		it('sends to /setup when no user exists yet', async () => {
			vi.mocked(apiClient.checkSetupRequired).mockResolvedValueOnce({ requires_setup: true });

			await authService.requireAuth('/documents/a');

			expect(goto).toHaveBeenCalledWith('/setup');
		});

		it('falls back to plain /login when the setup check fails', async () => {
			vi.mocked(apiClient.checkSetupRequired).mockRejectedValueOnce(new Error('down'));
			window.history.replaceState(null, '', '/documents/b');

			await authService.requireAuth();

			expect(goto).toHaveBeenCalledWith('/login');
			window.history.replaceState(null, '', '/');
		});
	});
});

describe('authService.initialize', () => {
	// initialize() runs once per instance, so each case loads a fresh module copy.
	let copy = 0;
	async function freshService() {
		const url = `./auth-service.ts?copy=${++copy}`;
		return ((await import(/* @vite-ignore */ url)) as typeof import('./auth-service')).authService;
	}

	it('skips everything when auth is disabled', async () => {
		vi.mocked(apiClient.getConfig).mockResolvedValueOnce({ auth_enabled: false } as AppConfig);
		const service = await freshService();

		await service.initialize();

		expect(service.isAuthEnabled()).toBe(false);
		await expect(service.requireAuth('/documents/a')).resolves.toBe(true);
		await service.handleSessionExpired('/documents/a');
		expect(goto).not.toHaveBeenCalled();
	});

	it('assumes auth is on when the config cannot be loaded', async () => {
		vi.mocked(apiClient.getConfig).mockRejectedValueOnce(new Error('down'));
		const service = await freshService();

		await service.initialize();

		expect(service.isAuthEnabled()).toBe(true);
	});

	it('loads the user for a stored token, once, even if called concurrently', async () => {
		vi.mocked(apiClient.getCurrentUser).mockResolvedValue(user);
		authActions.setAuth('token', null as never);
		const service = await freshService();

		await Promise.all([service.initialize(), service.initialize()]);
		await service.initialize();

		expect(apiClient.getConfig).toHaveBeenCalledTimes(1);
		expect(apiClient.getCurrentUser).toHaveBeenCalledTimes(1);
		expect(authStore.user).toEqual(user);
		expect(authStore.isLoading).toBe(false);
	});

	it('clears a stored token only on a genuine 401', async () => {
		authActions.setAuth('token', user);
		vi.mocked(apiClient.getCurrentUser).mockRejectedValueOnce(
			apiError('down', 'SERVICE_UNAVAILABLE')
		);
		await (await freshService()).initialize();
		expect(authStore.token).toBe('token');

		vi.mocked(apiClient.getCurrentUser).mockRejectedValueOnce(apiError('expired', 'UNAUTHORIZED'));
		await (await freshService()).initialize();
		expect(authStore.token).toBeNull();
	});
});
