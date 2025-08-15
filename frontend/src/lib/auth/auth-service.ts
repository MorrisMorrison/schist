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
			// If we can't get config, assume auth might be enabled
			// This prevents the chicken-and-egg problem where auth blocks config
			this.authEnabled = true;
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

	async loginWithPasskey(credentialId: string) {
		authActions.setLoading(true);
		authActions.clearError();

		try {
			const response = await apiClient.loginWithPasskey(credentialId);
			// Set the token in the API client immediately after successful login
			apiClient.setAuthToken(response.token);
			authActions.setAuth(response.token, response.user);

			// Trigger secrets store sync after successful auth
			try {
				const { secretStore } = await import('../stores/secrets');
				await secretStore.loadStatus();
				const secretsState = get(secretStore);
				if (secretsState.status?.unlocked) {
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
