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

const authState: AuthState = $state<AuthState>(loadAuthState());

// Initialize API token on store creation
if (authState.token) {
	apiClient.setAuthToken(authState.token);
}

// Function to sync token changes with API client
function syncTokenWithApiClient(token: string | null) {
	if (token) {
		apiClient.setAuthToken(token);
	} else {
		apiClient.setAuthToken(null);
	}
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
		authState.isLoading = loading;
		if (loading) {
			authState.error = null;
		}
	},

	setError(error: string | null) {
		authState.error = error;
		authState.isLoading = false;
	},

	setAuth(token: string, user: User) {
		saveToken(token);
		authState.token = token;
		authState.user = user;
		authState.isLoading = false;
		authState.error = null;
		syncTokenWithApiClient(token);
	},

	updateUser(user: User | null) {
		authState.user = user;
		authState.isLoading = false;
	},

	clearAuth() {
		saveToken(null);
		Object.assign(authState, defaultAuthState);
		syncTokenWithApiClient(null);
	},

	clearError() {
		authState.error = null;
	}
};

export type { User, AuthState };
