import { browser } from '$app/environment';
import { apiClient } from '$lib/api/client';

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

let authState: AuthState = loadAuthState();

if (browser) {
	authState = $state<AuthState>(loadAuthState());

	$effect(() => {
		if (authState.token) {
			apiClient.setAuthToken(authState.token);
		} else {
			apiClient.setAuthToken(null);
		}
	});
}

export const authStore = {
	get token() {
		return authState.token;
	},
	get user() {
		return authState.user;
	},
	get isLoading() {
		return authState.isLoading;
	},
	get error() {
		return authState.error;
	},
	get isAuthenticated() {
		return !!authState.token && !!authState.user;
	}
};

export const authActions = {
	setLoading(loading: boolean) {
		if (browser) {
			authState = {
				...authState,
				isLoading: loading,
				error: loading ? null : authState.error
			};
		}
	},

	setError(error: string | null) {
		if (browser) {
			authState = {
				...authState,
				error,
				isLoading: false
			};
		}
	},

	setAuth(token: string, user: User) {
		saveToken(token);
		if (browser) {
			authState = {
				...authState,
				token,
				user,
				isLoading: false,
				error: null
			};
		}
	},

	updateUser(user: User | null) {
		if (browser) {
			authState = {
				...authState,
				user,
				isLoading: false
			};
		}
	},

	clearAuth() {
		saveToken(null);
		if (browser) {
			authState = defaultAuthState;
		}
	},

	clearError() {
		if (browser) {
			authState = {
				...authState,
				error: null
			};
		}
	}
};

export type { User, AuthState };
