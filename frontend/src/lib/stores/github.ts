import { writable, derived } from 'svelte/store';
import { apiClient } from '../api/client.js';
import type {
	GitHubSettings,
	GitHubStatus,
	GitHubSyncResult,
	GitHubSetupRequest,
	GitHubConnectionTest
} from '../api/types.js';
import { browser } from '$app/environment';

interface GitHubState {
	settings: GitHubSettings | null;
	status: GitHubStatus | null;
	loading: boolean;
	error: string | null;
	syncing: boolean;
	lastSyncResult: GitHubSyncResult | null;
	connectionTest: GitHubConnectionTest | null;
	testingConnection: boolean;
}

const initialState: GitHubState = {
	settings: null,
	status: null,
	loading: false,
	error: null,
	syncing: false,
	lastSyncResult: null,
	connectionTest: null,
	testingConnection: false
};

export const githubStore = writable<GitHubState>(initialState);

export const githubSettings = derived(githubStore, ($store) => $store.settings);
export const githubStatus = derived(githubStore, ($store) => $store.status);
export const isGitHubLoading = derived(githubStore, ($store) => $store.loading);
export const githubError = derived(githubStore, ($store) => $store.error);
export const isGitHubSyncing = derived(githubStore, ($store) => $store.syncing);
export const lastSyncResult = derived(githubStore, ($store) => $store.lastSyncResult);
export const connectionTest = derived(githubStore, ($store) => $store.connectionTest);
export const isTestingConnection = derived(githubStore, ($store) => $store.testingConnection);

export const isGitHubConnected = derived(githubStatus, ($status) => $status?.connected ?? false);
export const isGitHubEnabled = derived(githubSettings, ($settings) => $settings?.enabled ?? false);
export const canSync = derived(
	[isGitHubConnected, isGitHubSyncing],
	([$connected, $syncing]) => $connected && !$syncing
);

export const githubActions = {
	async loadSettings() {
		return this.loadStatus();
	},

	async loadStatus() {
		githubStore.update((state) => ({ ...state, loading: true, error: null }));

		try {
			const status = await apiClient.getGitHubStatus();
			githubStore.update((state) => ({
				...state,
				status,
				loading: false
			}));
			return status;
		} catch (error) {
			githubStore.update((state) => ({
				...state,
				loading: false,
				error: error instanceof Error ? error.message : 'Failed to load GitHub status'
			}));
			throw error;
		}
	},

	async setupGitHub(setupRequest: GitHubSetupRequest) {
		githubStore.update((state) => ({ ...state, loading: true, error: null }));

		try {
			const setupResult = await apiClient.setupGitHub(setupRequest);

			const status = await apiClient.getGitHubStatus();

			githubStore.update((state) => ({
				...state,
				status,
				loading: false
			}));

			return setupResult;
		} catch (error) {
			githubStore.update((state) => ({
				...state,
				loading: false,
				error: error instanceof Error ? error.message : 'Failed to setup GitHub integration'
			}));
			throw error;
		}
	},

	async updateSettings(settingsUpdate: Partial<GitHubSettings>) {
		githubStore.update((state) => ({ ...state, loading: true, error: null }));

		try {
			const status = await apiClient.updateGitHubSettings(settingsUpdate);
			githubStore.update((state) => ({
				...state,
				status,
				loading: false
			}));
			return status;
		} catch (error) {
			githubStore.update((state) => ({
				...state,
				loading: false,
				error: error instanceof Error ? error.message : 'Failed to update GitHub settings'
			}));
			throw error;
		}
	},

	async testConnection(token: string, owner: string, repository: string) {
		githubStore.update((state) => ({
			...state,
			testingConnection: true,
			error: null,
			connectionTest: null
		}));

		try {
			const result = await apiClient.testGitHubConnection(token, owner, repository);
			githubStore.update((state) => ({
				...state,
				connectionTest: result,
				testingConnection: false
			}));
			return result;
		} catch (error) {
			githubStore.update((state) => ({
				...state,
				testingConnection: false,
				error: error instanceof Error ? error.message : 'Failed to test GitHub connection',
				connectionTest: {
					success: false,
					message: error instanceof Error ? error.message : 'Connection test failed'
				}
			}));
			throw error;
		}
	},

	async syncToGitHub() {
		githubStore.update((state) => ({ ...state, syncing: true, error: null }));

		try {
			const result = await apiClient.syncToGitHub();

			const status = await apiClient.getGitHubStatus();

			githubStore.update((state) => ({
				...state,
				lastSyncResult: result,
				status,
				syncing: false
			}));

			return result;
		} catch (error) {
			githubStore.update((state) => ({
				...state,
				syncing: false,
				error: error instanceof Error ? error.message : 'Failed to sync to GitHub'
			}));
			throw error;
		}
	},

	async disconnect() {
		// For now, just clear the local state since we don't have a disconnect API
		githubStore.update((state) => ({
			...state,
			settings: null,
			status: null,
			loading: false,
			connectionTest: null,
			lastSyncResult: null
		}));
	},

	async refresh() {
		try {
			await githubActions.loadStatus();
		} catch (error) {
			console.error('Failed to refresh GitHub data:', error);
		}
	},

	clearError() {
		githubStore.update((state) => ({ ...state, error: null }));
	},

	clearConnectionTest() {
		githubStore.update((state) => ({ ...state, connectionTest: null }));
	}
};

if (browser) {
	githubActions.refresh().catch(console.error);
}
