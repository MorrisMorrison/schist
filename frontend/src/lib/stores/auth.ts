import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';

interface User {
	username: string;
	created_at: string;
	last_login: string;
}

interface AuthState {
	token: string | null;
	user: User | null;
	isLoading: boolean;
	error: string | null;
}

const defaultAuthState: AuthState = {
	token: null,
	user: null,
	isLoading: false,
	error: null
};

const AUTH_STORAGE_KEY = 'schist_auth_token';

function loadAuthState(): AuthState {
	if (!browser) return defaultAuthState;

	try {
		const token = localStorage.getItem(AUTH_STORAGE_KEY);
		if (token) {
			return {
				...defaultAuthState,
				token
			};
		}
	} catch (error) {
		console.warn('Failed to load auth token from localStorage:', error);
	}

	return defaultAuthState;
}

function saveToken(token: string | null): void {
	if (!browser) return;

	try {
		if (token) {
			localStorage.setItem(AUTH_STORAGE_KEY, token);
		} else {
			localStorage.removeItem(AUTH_STORAGE_KEY);
		}
	} catch (error) {
		console.error('Failed to save auth token to localStorage:', error);
	}
}

export const authStore = writable<AuthState>(loadAuthState());

export const isAuthenticated = derived(authStore, ($auth) => !!$auth.token && !!$auth.user);
export const currentUser = derived(authStore, ($auth) => $auth.user);
export const authToken = derived(authStore, ($auth) => $auth.token);
export const isLoading = derived(authStore, ($auth) => $auth.isLoading);
export const authError = derived(authStore, ($auth) => $auth.error);

export const authActions = {
	setLoading(loading: boolean) {
		authStore.update((current) => ({
			...current,
			isLoading: loading,
			error: loading ? null : current.error
		}));
	},

	setError(error: string | null) {
		authStore.update((current) => ({
			...current,
			error,
			isLoading: false
		}));
	},

	setAuth(token: string, user: User) {
		saveToken(token);
		authStore.update((current) => ({
			...current,
			token,
			user,
			isLoading: false,
			error: null
		}));
	},

	updateUser(user: User | null) {
		authStore.update((current) => ({
			...current,
			user,
			isLoading: false
		}));
	},

	clearAuth() {
		saveToken(null);
		authStore.set(defaultAuthState);
	},

	clearError() {
		authStore.update((current) => ({
			...current,
			error: null
		}));
	}
};

export type { User, AuthState };
