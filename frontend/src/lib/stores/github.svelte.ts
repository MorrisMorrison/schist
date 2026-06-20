import { apiClient } from '../api/client';
import { getErrorMessage } from '$lib/utils/error';
import { runAsync } from '$lib/stores/resource.svelte';
import type {
	GitHubSettings,
	GitHubConnectionStatus,
	GitHubSyncResult,
	GitHubSetupRequest,
	GitHubConnectionTest,
	GitHubConfigRequest
} from '../api/types';

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
}

const defaultGitHubState: GitHubState = {
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
	lastRepairResult: null
};

const githubState: GitHubState = $state<GitHubState>(defaultGitHubState);

export const githubStore = {
	get settings() {
		return githubState.settings;
	},
	get connectionStatus() {
		return githubState.connectionStatus;
	},
	get loading() {
		return githubState.loading;
	},
	get error() {
		return githubState.error;
	},
	get syncing() {
		return githubState.syncing;
	},
	get lastSyncResult() {
		return githubState.lastSyncResult;
	},
	get connectionTest() {
		return githubState.connectionTest;
	},
	get testingConnection() {
		return githubState.testingConnection;
	},
	get gitHealthStatus() {
		return githubState.gitHealthStatus;
	},
	get checkingHealth() {
		return githubState.checkingHealth;
	},
	get repairingRepository() {
		return githubState.repairingRepository;
	},
	get lastRepairResult() {
		return githubState.lastRepairResult;
	}
};

export const githubActions = {
	async loadGitHubSettings(force = false) {
		return runAsync(
			githubState,
			async () => {
				const settings = await apiClient.getGitHubSettings(force);
				githubState.settings = settings;
				return settings;
			},
			'Failed to load GitHub settings'
		);
	},

	async loadConnectionStatus(force = false) {
		return runAsync(
			githubState,
			async () => {
				const connectionStatus = await apiClient.getGitHubConnectionStatus(force);
				githubState.connectionStatus = connectionStatus;
				return connectionStatus;
			},
			'Failed to load GitHub connection status'
		);
	},

	async setupGitHub(setupRequest: GitHubSetupRequest) {
		return runAsync(
			githubState,
			async () => {
				const setupResult = await apiClient.setupGitHub(setupRequest);

				const settings = setupResult.settings || (await apiClient.getGitHubSettings(true));
				const connectionStatus =
					setupResult.connection || (await apiClient.getGitHubConnectionStatus(true));

				githubState.settings = settings;
				githubState.connectionStatus = connectionStatus;

				return setupResult;
			},
			'Failed to setup GitHub integration'
		);
	},

	async updateSettings(settingsUpdate: GitHubConfigRequest) {
		return runAsync(
			githubState,
			async () => {
				await apiClient.updateGitHubSettings(settingsUpdate);
				const settings = await apiClient.getGitHubSettings(true);
				const connectionStatus = await apiClient.getGitHubConnectionStatus(true);
				githubState.settings = settings;
				githubState.connectionStatus = connectionStatus;
				return { settings, connectionStatus };
			},
			'Failed to update GitHub settings'
		);
	},

	async testConnection(token: string, owner: string, repository: string) {
		githubState.testingConnection = true;
		githubState.error = null;
		githubState.connectionTest = null;

		try {
			const result = await apiClient.testGitHubConnection(token, owner, repository);
			githubState.connectionTest = result;
			githubState.testingConnection = false;
			return result;
		} catch (error) {
			githubState.testingConnection = false;
			githubState.error = getErrorMessage(error, 'Failed to test GitHub connection');
			githubState.connectionTest = {
				success: false,
				message: getErrorMessage(error, 'Connection test failed')
			};
			throw error;
		}
	},

	async syncToGitHub() {
		githubState.syncing = true;
		githubState.error = null;

		try {
			const result = await apiClient.syncToGitHub();

			const connectionStatus = await apiClient.getGitHubConnectionStatus(true);

			githubState.lastSyncResult = result;
			githubState.connectionStatus = connectionStatus;
			githubState.syncing = false;

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

			githubState.syncing = false;
			githubState.error = errorMessage;
			throw error;
		}
	},

	async disconnect() {
		return runAsync(
			githubState,
			async () => {
				const result = await apiClient.disconnectGitHub();
				githubState.settings = result.settings;
				githubState.connectionStatus = result.connection;
				githubState.connectionTest = null;
				githubState.lastSyncResult = null;
				return result;
			},
			'Failed to disconnect from GitHub'
		);
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
		githubState.error = null;
	},

	clearConnectionTest() {
		githubState.connectionTest = null;
	},

	async checkGitHealth() {
		githubState.checkingHealth = true;
		githubState.gitHealthStatus = null;

		try {
			const result = await apiClient.checkGitHealth();

			githubState.gitHealthStatus = { healthy: result.healthy, error: result.error };
			githubState.checkingHealth = false;

			if (!result.healthy) {
				throw new Error(result.error || 'Git repository is not healthy');
			}

			return result;
		} catch (error) {
			const errorMessage = getErrorMessage(error, 'Failed to check Git repository health');

			githubState.checkingHealth = false;
			githubState.gitHealthStatus = { healthy: false, error: errorMessage };

			throw error;
		}
	},

	clearHealthStatus() {
		githubState.gitHealthStatus = null;
	},

	async repairRepository() {
		githubState.repairingRepository = true;
		githubState.lastRepairResult = null;

		try {
			const result = await apiClient.repairGitRepository();

			githubState.repairingRepository = false;
			githubState.lastRepairResult = {
				success: result.success,
				message: result.message
			};

			if (result.success) {
				await this.checkGitHealth();
			}

			return result;
		} catch (error) {
			const errorMessage = getErrorMessage(error, 'Failed to repair Git repository');

			githubState.repairingRepository = false;
			githubState.lastRepairResult = {
				success: false,
				error: errorMessage
			};

			throw error;
		}
	},

	clearRepairResult() {
		githubState.lastRepairResult = null;
	}
};

// Delay initial refresh to avoid interference with setup flows
setTimeout(() => {
	githubActions.refresh().catch(console.error);
}, 500);
