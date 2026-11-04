import { apiClient } from '../api/client';
import { getErrorMessage, parseError, type ErrorCode } from '#lib/utils/error.ts';
import { runAsync } from '#lib/stores/resource.svelte.ts';
import { secretStore } from '#lib/stores/secrets.svelte.ts';
import type {
	GitHubSettings,
	GitHubConnectionStatus,
	GitHubStatus,
	GitHubSyncResult,
	GitHubSetupRequest,
	GitHubConnectionTest,
	GitHubConfigRequest,
	GitHubSyncOptions,
	SyncPreview,
	ConflictVersions
} from '../api/types';

interface GitHubState {
	settings: GitHubSettings | null;
	connectionStatus: GitHubConnectionStatus | null;
	loading: boolean;
	error: string | null;
	/** The API error code of the last failed sync (e.g. SYNC_REMOTE_DIVERGED). */
	syncErrorCode: ErrorCode | null;
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
	syncErrorCode: null,
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

/** Sync failures the UI explains itself; every other code shows the server's message. */
const syncErrorMessages: Partial<Record<ErrorCode, string>> = {
	SECRETS_LOCKED: 'Secrets are locked. Unlock them to sync to GitHub.',
	INVALID_STATE: 'GitHub backup is not set up. Complete the setup first.',
	NETWORK_ERROR: 'Could not reach the server. Check your connection and try again.'
};

/** Splits a combined status (setup, config and disconnect responses) into the two halves the store keeps. */
function splitStatus(status: GitHubStatus): {
	settings: GitHubSettings;
	connectionStatus: GitHubConnectionStatus;
} {
	const { connected, token_exists, pending_changes, ...settings } = status;
	return { settings, connectionStatus: { connected, token_exists, pending_changes } };
}

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
	get syncErrorCode() {
		return githubState.syncErrorCode;
	},
	/** The GitHub branch has commits the wiki doesn't have, from a manual or a background sync. */
	get remoteDiverged() {
		return (
			githubState.syncErrorCode === 'SYNC_REMOTE_DIVERGED' ||
			githubState.settings?.last_sync_error_code === 'SYNC_REMOTE_DIVERGED'
		);
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

	/**
	 * Sets up the integration. A SECRETS_LOCKED rejection also refreshes the
	 * secrets status, so the UI stops showing a stale "unlocked".
	 */
	async setupGitHub(setupRequest: GitHubSetupRequest) {
		try {
			return await runAsync(
				githubState,
				async () => {
					const setupResult = await apiClient.setupGitHub(setupRequest);
					if (setupResult.status) {
						const { settings, connectionStatus } = splitStatus(setupResult.status);
						githubState.settings = settings;
						githubState.connectionStatus = connectionStatus;
					} else {
						githubState.settings = await apiClient.getGitHubSettings(true);
						githubState.connectionStatus = await apiClient.getGitHubConnectionStatus(true);
					}
					return setupResult;
				},
				'Failed to setup GitHub integration'
			);
		} catch (error) {
			if (parseError(error).code === 'SECRETS_LOCKED') {
				await secretStore.loadStatus().catch(() => {});
			}
			throw error;
		}
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

	async testConnection(token: string, owner: string, repository: string, branch?: string) {
		githubState.testingConnection = true;
		githubState.error = null;
		githubState.connectionTest = null;

		try {
			const result = await apiClient.testGitHubConnection(token, owner, repository, branch);
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

	/**
	 * Syncs now. Errors are told apart by their API code, never by message
	 * text. `replaceRemote` force-pushes over a diverged GitHub branch: only
	 * pass it after the user confirmed.
	 */
	async syncToGitHub(options: GitHubSyncOptions = {}) {
		githubState.syncing = true;
		githubState.error = null;
		githubState.syncErrorCode = null;

		try {
			const result = await apiClient.syncToGitHub(options);
			githubState.lastSyncResult = result;
			githubState.connectionStatus = await apiClient.getGitHubConnectionStatus(true);
			return result;
		} catch (error) {
			const { code } = parseError(error);
			githubState.syncErrorCode = code ?? null;
			// A paused sync is not a failure: the settings list the pages waiting for a side.
			githubState.error =
				code === 'SYNC_CONFLICT'
					? null
					: (code && syncErrorMessages[code]) || getErrorMessage(error, 'Failed to sync to GitHub');
			if (code === 'SECRETS_LOCKED') {
				await secretStore.loadStatus().catch(() => {});
			}
			throw error;
		} finally {
			githubState.syncing = false;
			// The server records every sync's outcome: show the new last-sync status.
			try {
				const settings = await apiClient.getGitHubSettings(true);
				if (settings) githubState.settings = settings;
			} catch {
				// Keep the settings we have; the sync's own result is what matters here.
			}
		}
	},

	async previewSync(): Promise<SyncPreview> {
		return apiClient.previewGitHubSync();
	},

	async loadConflict(path: string): Promise<ConflictVersions> {
		return apiClient.getGitHubSyncConflict(path);
	},

	async disconnect() {
		return runAsync(
			githubState,
			async () => {
				const result = await apiClient.disconnectGitHub();
				const split = result?.status ? splitStatus(result.status) : null;
				githubState.settings = split?.settings ?? null;
				githubState.connectionStatus = split?.connectionStatus ?? null;
				githubState.connectionTest = null;
				githubState.lastSyncResult = null;
				githubState.syncErrorCode = null;
				return result;
			},
			'Failed to disconnect from GitHub'
		);
	},

	/** Reloads settings and, when the secrets allow it, the connection status. */
	async refresh(force = false) {
		try {
			await githubActions.loadGitHubSettings(force);
			try {
				await githubActions.loadConnectionStatus(force);
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
		githubState.syncErrorCode = null;
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
