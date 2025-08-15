import { writable, derived } from 'svelte/store';
import { apiClient } from '../api/client.js';
import type {
	GitHubSettings,
	GitHubConnectionStatus,
	GitHubSyncResult,
	GitHubSetupRequest,
	GitHubConnectionTest,
	GitHubConfigRequest,
	GitHubDocsRepoConfig
} from '../api/types.js';
import { browser } from '$app/environment';

interface GitHubState {
	settings: GitHubSettings | null;
	connectionStatus: GitHubConnectionStatus | null;
	loading: boolean;
	error: string | null;
	syncing: boolean;
	lastSyncResult: GitHubSyncResult | null;
	connectionTest: GitHubConnectionTest | null;
	testingConnection: boolean;
	gitHealthStatus: { healthy: boolean; error?: string } | null;
	checkingHealth: boolean;
	repairingRepository: boolean;
	lastRepairResult: { success: boolean; message?: string; error?: string } | null;
	docsRepositories: GitHubDocsRepoConfig[];
}

const initialState: GitHubState = {
	settings: null,
	connectionStatus: null,
	loading: false,
	error: null,
	syncing: false,
	lastSyncResult: null,
	connectionTest: null,
	testingConnection: false,
	gitHealthStatus: null,
	checkingHealth: false,
	repairingRepository: false,
	lastRepairResult: null,
	docsRepositories: []
};

export const githubStore = writable<GitHubState>(initialState);

export const githubSettings = derived(githubStore, ($store) => $store.settings);
export const githubConnectionStatus = derived(githubStore, ($store) => $store.connectionStatus);
export const isGitHubLoading = derived(githubStore, ($store) => $store.loading);
export const githubError = derived(githubStore, ($store) => $store.error);
export const isGitHubSyncing = derived(githubStore, ($store) => $store.syncing);
export const lastSyncResult = derived(githubStore, ($store) => $store.lastSyncResult);
export const connectionTest = derived(githubStore, ($store) => $store.connectionTest);
export const isTestingConnection = derived(githubStore, ($store) => $store.testingConnection);
export const gitHealthStatus = derived(githubStore, ($store) => $store.gitHealthStatus);
export const isCheckingHealth = derived(githubStore, ($store) => $store.checkingHealth);
export const isRepairingRepository = derived(githubStore, ($store) => $store.repairingRepository);
export const lastRepairResult = derived(githubStore, ($store) => $store.lastRepairResult);
export const docsRepositories = derived(githubStore, ($store) => $store.docsRepositories);

export const isGitHubConnected = derived(
	githubConnectionStatus,
	($status) => $status?.connected ?? false
);
export const isGitHubEnabled = derived(githubSettings, ($settings) => $settings?.enabled ?? false);
export const canSync = derived(
	[isGitHubConnected, isGitHubSyncing],
	([$connected, $syncing]) => $connected && !$syncing
);

export const githubActions = {
	async loadGitHubSettings(force = false) {
		githubStore.update((state) => ({ ...state, loading: true, error: null }));

		try {
			const settings = await apiClient.getGitHubSettings(force);
			githubStore.update((state) => ({
				...state,
				settings,
				loading: false
			}));
			return settings;
		} catch (error) {
			githubStore.update((state) => ({
				...state,
				loading: false,
				error: error instanceof Error ? error.message : 'Failed to load GitHub settings'
			}));
			throw error;
		}
	},

	async loadConnectionStatus(force = false) {
		githubStore.update((state) => ({ ...state, loading: true, error: null }));

		try {
			const connectionStatus = await apiClient.getGitHubConnectionStatus(force);
			githubStore.update((state) => ({
				...state,
				connectionStatus,
				loading: false
			}));
			return connectionStatus;
		} catch (error) {
			githubStore.update((state) => ({
				...state,
				loading: false,
				error: error instanceof Error ? error.message : 'Failed to load GitHub connection status'
			}));
			throw error;
		}
	},

	async setupGitHub(setupRequest: GitHubSetupRequest) {
		githubStore.update((state) => ({ ...state, loading: true, error: null }));

		try {
			const setupResult = await apiClient.setupGitHub(setupRequest);

			const settings = setupResult.settings || (await apiClient.getGitHubSettings(true));
			const connectionStatus =
				setupResult.connection || (await apiClient.getGitHubConnectionStatus(true));

			githubStore.update((state) => ({
				...state,
				settings,
				connectionStatus,
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

	async updateSettings(settingsUpdate: GitHubConfigRequest) {
		githubStore.update((state) => ({ ...state, loading: true, error: null }));

		try {
			await apiClient.updateGitHubSettings(settingsUpdate);
			const settings = await apiClient.getGitHubSettings(true);
			const connectionStatus = await apiClient.getGitHubConnectionStatus(true);
			githubStore.update((state) => ({
				...state,
				settings,
				connectionStatus,
				loading: false
			}));
			return { settings, connectionStatus };
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

			const connectionStatus = await apiClient.getGitHubConnectionStatus(true);

			githubStore.update((state) => ({
				...state,
				lastSyncResult: result,
				connectionStatus,
				syncing: false
			}));

			return result;
		} catch (error) {
			let errorMessage = 'Failed to sync to GitHub';

			if (error instanceof Error) {
				const message = error.message.toLowerCase();

				if (message.includes('git repository is not properly initialized')) {
					errorMessage = 'Git repository is not properly set up. Please check repository health.';
				} else if (message.includes('failed to access github repository')) {
					errorMessage =
						'Cannot access GitHub repository. Please check your credentials and repository permissions.';
				} else if (message.includes('failed to setup git remote')) {
					errorMessage = 'Could not configure Git remote connection to GitHub repository.';
				} else if (message.includes('failed to commit')) {
					errorMessage = 'Could not create local Git commit. Check for file permission issues.';
				} else if (message.includes('failed to push to github')) {
					errorMessage =
						'Could not push changes to GitHub. Check network connection and repository permissions.';
				} else if (message.includes('github integration is not enabled')) {
					errorMessage =
						'GitHub integration is not properly configured. Please set up GitHub connection first.';
				} else {
					errorMessage = error.message;
				}
			}

			githubStore.update((state) => ({
				...state,
				syncing: false,
				error: errorMessage
			}));
			throw error;
		}
	},

	async disconnect() {
		githubStore.update((state) => ({ ...state, loading: true, error: null }));

		try {
			const result = await apiClient.disconnectGitHub();
			githubStore.update((state) => ({
				...state,
				settings: result.settings,
				connectionStatus: result.connection,
				loading: false,
				connectionTest: null,
				lastSyncResult: null
			}));
			return result;
		} catch (error) {
			githubStore.update((state) => ({
				...state,
				loading: false,
				error: error instanceof Error ? error.message : 'Failed to disconnect from GitHub'
			}));
			throw error;
		}
	},

	async refresh() {
		try {
			await githubActions.loadGitHubSettings();
			try {
				await githubActions.loadConnectionStatus();
			} catch (error) {
				// Connection status might fail if secrets are locked
				console.debug('Connection status unavailable (secrets may be locked):', error);
			}
		} catch (error) {
			console.error('Failed to refresh GitHub data:', error);
		}
	},

	clearError() {
		githubStore.update((state) => ({ ...state, error: null }));
	},

	clearConnectionTest() {
		githubStore.update((state) => ({ ...state, connectionTest: null }));
	},

	async checkGitHealth() {
		githubStore.update((state) => ({
			...state,
			checkingHealth: true,
			gitHealthStatus: null
		}));

		try {
			const result = await apiClient.checkGitHealth();

			githubStore.update((state) => ({
				...state,
				gitHealthStatus: { healthy: result.healthy, error: result.error },
				checkingHealth: false
			}));

			if (!result.healthy) {
				throw new Error(result.error || 'Git repository is not healthy');
			}

			return result;
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : 'Failed to check Git repository health';

			githubStore.update((state) => ({
				...state,
				checkingHealth: false,
				gitHealthStatus: { healthy: false, error: errorMessage }
			}));

			throw error;
		}
	},

	clearHealthStatus() {
		githubStore.update((state) => ({ ...state, gitHealthStatus: null }));
	},

	async repairRepository() {
		githubStore.update((state) => ({
			...state,
			repairingRepository: true,
			lastRepairResult: null
		}));

		try {
			const result = await apiClient.repairGitRepository();

			githubStore.update((state) => ({
				...state,
				repairingRepository: false,
				lastRepairResult: {
					success: result.success,
					message: result.message
				}
			}));

			if (result.success) {
				await this.checkGitHealth();
			}

			return result;
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : 'Failed to repair Git repository';

			githubStore.update((state) => ({
				...state,
				repairingRepository: false,
				lastRepairResult: {
					success: false,
					error: errorMessage
				}
			}));

			throw error;
		}
	},

	clearRepairResult() {
		githubStore.update((state) => ({ ...state, lastRepairResult: null }));
	},

	// GitHub docs actions
	async loadDocsRepositories(force = false) {
		githubStore.update((state) => ({ ...state, loading: true, error: null }));

		try {
			const response = await apiClient.getDocsRepositories(force);
			githubStore.update((state) => ({
				...state,
				docsRepositories: response.repositories,
				loading: false
			}));
			return response.repositories;
		} catch (error) {
			githubStore.update((state) => ({
				...state,
				loading: false,
				error: error instanceof Error ? error.message : 'Failed to load docs repositories'
			}));
			throw error;
		}
	},

	async addDocsRepository(owner: string, repo: string, docsFolder?: string, branch?: string) {
		githubStore.update((state) => ({ ...state, loading: true, error: null }));

		try {
			const result = await apiClient.addDocsRepository(owner, repo, docsFolder, branch);
			// Reload repositories to get updated list with the new repo
			await this.loadDocsRepositories();
			return result;
		} catch (error) {
			githubStore.update((state) => ({
				...state,
				loading: false,
				error: error instanceof Error ? error.message : 'Failed to add docs repository'
			}));
			throw error;
		}
	},

	async removeDocsRepository(owner: string, repo: string) {
		githubStore.update((state) => ({ ...state, loading: true, error: null }));

		try {
			const result = await apiClient.removeDocsRepository(owner, repo);
			// Reload repositories to get updated list without the removed repo
			await this.loadDocsRepositories();
			return result;
		} catch (error) {
			githubStore.update((state) => ({
				...state,
				loading: false,
				error: error instanceof Error ? error.message : 'Failed to remove docs repository'
			}));
			throw error;
		}
	},

	async syncDocsRepository(owner: string, repo: string) {
		githubStore.update((state) => ({ ...state, syncing: true, error: null }));

		try {
			const result = await apiClient.syncDocsRepository(owner, repo);
			// Reload repositories to get updated sync status and document counts
			await this.loadDocsRepositories();
			githubStore.update((state) => ({
				...state,
				syncing: false
			}));
			return result;
		} catch (error) {
			githubStore.update((state) => ({
				...state,
				syncing: false,
				error: error instanceof Error ? error.message : 'Failed to sync docs repository'
			}));
			throw error;
		}
	},

	async syncAllDocsRepositories() {
		githubStore.update((state) => ({ ...state, syncing: true, error: null }));

		try {
			const result = await apiClient.syncAllDocsRepositories();
			// Reload repositories to get updated sync status and document counts
			await this.loadDocsRepositories();
			githubStore.update((state) => ({
				...state,
				syncing: false
			}));
			return result;
		} catch (error) {
			githubStore.update((state) => ({
				...state,
				syncing: false,
				error: error instanceof Error ? error.message : 'Failed to sync all docs repositories'
			}));
			throw error;
		}
	}
};

if (browser) {
	// Delay initial refresh to avoid interference with setup flows
	setTimeout(() => {
		githubActions.refresh().catch(console.error);
		// Load docs repositories on initialization
		githubActions.loadDocsRepositories().catch(console.error);
	}, 500);
}
