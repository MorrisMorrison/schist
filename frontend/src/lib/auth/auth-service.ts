import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { apiClient } from '$lib/api/client';
import { authActions, authStore } from '$lib/stores/auth';
import { get } from 'svelte/store';

class AuthService {
	private initialized = false;
	private authEnabled: boolean | null = null;
	private initPromise: Promise<void> | null = null;
	private authCheckPromise: Promise<boolean> | null = null;

	async initialize() {
		if (this.initialized || !browser) return;

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
			this.authEnabled = false;
		}

		if (!this.authEnabled) {
			this.initialized = true;
			return;
		}

		const currentAuth = get(authStore);

		if (currentAuth.token) {
			apiClient.setAuthToken(currentAuth.token);

			try {
				authActions.setLoading(true);
				const user = await apiClient.getCurrentUser();
				authActions.updateUser(user);
			} catch {
				authActions.clearAuth();
				apiClient.setAuthToken(null);
			} finally {
				authActions.setLoading(false);
			}
		}

		this.initialized = true;
	}

	async login(username: string, password: string) {
		authActions.setLoading(true);
		authActions.clearError();

		try {
			const response = await apiClient.login({ username, password });
			authActions.setAuth(response.token, response.user);
			return response;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Login failed';
			const friendlyError = errorMessage.includes('Invalid username or password')
				? 'Invalid username or password'
				: 'Login failed. Please try again.';
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
			apiClient.setAuthToken(null);
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
		const currentAuth = get(authStore);

		if (!currentAuth.token) {
			return false;
		}

		try {
			await apiClient.getCurrentUser();
			return true;
		} catch {
			authActions.clearAuth();
			apiClient.setAuthToken(null);
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

		const isAuthenticated = await this.checkAuthStatus();

		if (!isAuthenticated) {
			// In browser environment, redirect using goto
			if (browser) {
				const loginUrl = returnUrl ? `/login?returnUrl=${encodeURIComponent(returnUrl)}` : '/login';
				await goto(loginUrl);
			}
			return false;
		}

		return true;
	}
}

export const authService = new AuthService();
