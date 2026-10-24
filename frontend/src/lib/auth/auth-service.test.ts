import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AppConfig, User } from '$lib/api/types';

vi.mock('$lib/api/client', () => ({
	apiClient: {
		setAuthToken: vi.fn(),
		getConfig: vi.fn(),
		getCurrentUser: vi.fn(),
		checkSetupRequired: vi.fn()
	}
}));

import { goto } from '$app/navigation';
import { apiClient } from '$lib/api/client';
import { authActions, authStore } from '$lib/stores/auth.svelte';
import { authService } from './auth-service';

const user = { username: 'alice', created_at: '', last_login: '' } as User;
const apiError = (error: string, code: string) => new Error(JSON.stringify({ error, code }));

describe('authService', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		vi.mocked(apiClient.getConfig).mockResolvedValue({ auth_enabled: true } as AppConfig);
		vi.mocked(apiClient.getCurrentUser).mockResolvedValue(user);
		vi.mocked(apiClient.checkSetupRequired).mockResolvedValue({ requires_setup: false });
		await authService.initialize();
		authActions.setAuth('token', user);
	});

	describe('checkAuthStatus', () => {
		it('keeps the session when the check fails for a non-auth reason', async () => {
			vi.mocked(apiClient.getCurrentUser).mockRejectedValueOnce(
				apiError('unavailable', 'SERVICE_UNAVAILABLE')
			);

			await expect(authService.checkAuthStatus()).resolves.toBe(true);
			expect(authStore.token).toBe('token');
		});

		it('clears the session on a genuine 401', async () => {
			vi.mocked(apiClient.getCurrentUser).mockRejectedValueOnce(
				apiError('unauthorized', 'UNAUTHORIZED')
			);

			await expect(authService.checkAuthStatus()).resolves.toBe(false);
			expect(authStore.token).toBeNull();
		});
	});

	describe('handleSessionExpired', () => {
		it('redirects to login without re-checking the session', async () => {
			await authService.handleSessionExpired('/documents/a?x=1');

			expect(apiClient.getCurrentUser).not.toHaveBeenCalled();
			expect(goto).toHaveBeenCalledWith(
				'/login?returnUrl=' + encodeURIComponent('/documents/a?x=1')
			);
		});

		it('does not redirect from public routes, including ones with a query string', async () => {
			await authService.handleSessionExpired('/login?returnUrl=%2F');
			await authService.handleSessionExpired('/share/abc');

			expect(goto).not.toHaveBeenCalled();
		});

		it('settles while a status check is in flight (no promise cycle)', async () => {
			// Simulate the API client: the in-flight /auth/me gets a confirmed 401
			// and calls handleSessionExpired before rejecting.
			vi.mocked(apiClient.getCurrentUser).mockImplementationOnce(async () => {
				authActions.clearAuth();
				await authService.handleSessionExpired('/documents/a');
				throw apiError('unauthorized', 'UNAUTHORIZED');
			});

			await expect(authService.checkAuthStatus()).resolves.toBe(false);
			expect(goto).toHaveBeenCalledWith('/login?returnUrl=' + encodeURIComponent('/documents/a'));
		});
	});
});
