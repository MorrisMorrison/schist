import { goto } from '$app/navigation';
import { apiClient } from '$lib/api/client';
import { authActions, authStore } from '$lib/stores/auth.svelte';
import { isUnauthorizedError } from '$lib/utils/error';

const PUBLIC_ROUTES = ['/login', '/setup'];
const PUBLIC_ROUTE_PREFIXES = ['/share/'];

class AuthService {
	private initialized = false;
	private authEnabled: boolean | null = null;
	private initPromise: Promise<void> | null = null;
	private authCheckPromise: Promise<boolean> | null = null;

	async initialize() {
		if (this.initialized) return;

		if (this.initPromise) {
			return this.initPromise;
		}

		this.initPromise = this.doInitialize();
		return this.initPromise;
	}

	private async doInitialize() {
		try {
			const config = await apiClient.getConfig();
			this.authEnabled = config.auth_enabled;
		} catch (error) {
			console.warn('Failed to get config:', error);
			this.authEnabled = true;
		}

		if (!this.authEnabled) {
			this.initialized = true;
			return;
		}

		if (authStore.token) {
			try {
				authActions.setLoading(true);
				const user = await apiClient.getCurrentUser();
				authActions.updateUser(user);
			} catch (error) {
				// Only clear auth on a genuine 401. A transient/network failure of
				// getCurrentUser (slow or briefly unavailable server) must NOT log the
				// user out -- doing so bounces an authenticated session to /login on a
				// flaky request.
				if (isUnauthorizedError(error)) {
					authActions.clearAuth();
				}
			} finally {
				authActions.setLoading(false);
			}
		}

		this.initialized = true;
	}

	async loginWithPasskey(authTicket: string) {
		authActions.setLoading(true);
		authActions.clearError();

		try {
			const response = await apiClient.loginWithPasskey(authTicket);
			authActions.setAuth(response.token, response.user);

			// Trigger secrets store sync after successful auth
			try {
				const { secretStore } = await import('../stores/secrets.svelte');
				await secretStore.loadStatus();
				if (secretStore.status?.unlocked) {
					await secretStore.loadSecrets();
				}
			} catch (error) {
				console.warn('Failed to sync secrets after login:', error);
			}

			return response;
		} catch (error) {
			const friendlyError = 'Passkey authentication failed. Please try again.';
			authActions.setError(friendlyError);
			throw error;
		} finally {
			authActions.setLoading(false);
		}
	}

	async logout() {
		authActions.setLoading(true);

		try {
			await apiClient.logout();
		} catch (error) {
			console.warn('Logout request failed:', error);
		} finally {
			authActions.clearAuth();
			authActions.setLoading(false);
			await goto('/login');
		}
	}

	async checkAuthStatus(): Promise<boolean> {
		// Prevent duplicate auth checks
		if (this.authCheckPromise) {
			return this.authCheckPromise;
		}

		this.authCheckPromise = this.doCheckAuthStatus();

		// Clear the promise after completion to allow future checks
		this.authCheckPromise.finally(() => {
			this.authCheckPromise = null;
		});

		return this.authCheckPromise;
	}

	private async doCheckAuthStatus(): Promise<boolean> {
		if (!authStore.token) {
			return false;
		}

		try {
			await apiClient.getCurrentUser();
			return true;
		} catch {
			authActions.clearAuth();
			return false;
		}
	}

	isAuthEnabled(): boolean {
		return this.authEnabled === true;
	}

	async requireAuth(returnUrl?: string) {
		if (!this.isAuthEnabled()) {
			return true;
		}

		if (this.isPublicRoute(returnUrl)) {
			return true;
		}

		const isAuthenticated = await this.checkAuthStatus();

		if (!isAuthenticated) {
			// Redirect to auth page
			await this.redirectToAuthPage(returnUrl);
			return false;
		}

		return true;
	}

	private isPublicRoute(path?: string): boolean {
		if (!path) {
			path = window.location.pathname;
		}

		if (PUBLIC_ROUTES.includes(path)) {
			return true;
		}

		return PUBLIC_ROUTE_PREFIXES.some((prefix) => path!.startsWith(prefix));
	}

	private async redirectToAuthPage(returnUrl?: string) {
		try {
			const setupStatus = await apiClient.checkSetupRequired();
			if (setupStatus.requires_setup) {
				await goto('/setup');
				return;
			}
		} catch (setupError) {
			console.warn('Setup status check failed, redirecting to login:', setupError);
		}

		const loginUrl = returnUrl ? `/login?returnUrl=${encodeURIComponent(returnUrl)}` : '/login';
		await goto(loginUrl);
	}
}

export const authService = new AuthService();
