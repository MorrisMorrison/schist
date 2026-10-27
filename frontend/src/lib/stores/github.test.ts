import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

vi.mock('#lib/api/client.ts', () => ({
	apiClient: {
		getGitHubSettings: vi.fn(),
		getGitHubConnectionStatus: vi.fn(),
		setupGitHub: vi.fn(),
		updateGitHubSettings: vi.fn(),
		testGitHubConnection: vi.fn(),
		syncToGitHub: vi.fn(),
		disconnectGitHub: vi.fn(),
		checkGitHealth: vi.fn(),
		repairGitRepository: vi.fn()
	}
}));

import { apiClient } from '#lib/api/client.ts';
import { githubActions, githubStore } from './github.svelte';

const api = vi.mocked(apiClient);
const settings = { enabled: true, owner: 'o', repository: 'r' } as never;
const connected = { connected: true } as never;
const apiError = (error: string, code: string) => new Error(JSON.stringify({ error, code }));

describe('github store', () => {
	beforeAll(async () => {
		api.getGitHubSettings.mockResolvedValue(settings);
		api.getGitHubConnectionStatus.mockResolvedValue(connected);
		// The store refreshes itself 500ms after import.
		await vi.waitFor(() => expect(githubStore.settings).toEqual(settings), { timeout: 2000 });
	});

	beforeEach(() => {
		vi.clearAllMocks();
		githubActions.clearError();
		api.getGitHubSettings.mockResolvedValue(settings);
		api.getGitHubConnectionStatus.mockResolvedValue(connected);
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(console, 'debug').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('loaded settings and connection status on start-up', () => {
		expect(githubStore.connectionStatus).toEqual(connected);
	});

	it('loads settings and status, forwarding force', async () => {
		await expect(githubActions.loadGitHubSettings(true)).resolves.toEqual(settings);
		expect(api.getGitHubSettings).toHaveBeenCalledWith(true);
		await githubActions.loadConnectionStatus();
		expect(api.getGitHubConnectionStatus).toHaveBeenCalledWith(false);
		expect(githubStore.loading).toBe(false);
	});

	it('stores the API error message when loading fails', async () => {
		api.getGitHubSettings.mockRejectedValueOnce(apiError('Secrets are locked', 'FORBIDDEN'));

		await expect(githubActions.loadGitHubSettings()).rejects.toThrow();
		expect(githubStore.error).toBe('Secrets are locked');
		expect(githubStore.loading).toBe(false);
	});

	it('uses the setup response, falling back to fresh reads', async () => {
		const other = { enabled: false } as never;
		api.setupGitHub.mockResolvedValueOnce({ settings: other, connection: connected } as never);
		await githubActions.setupGitHub({ token: 't' } as never);
		expect(githubStore.settings).toEqual(other);
		expect(api.getGitHubSettings).not.toHaveBeenCalled();

		api.setupGitHub.mockResolvedValueOnce({ message: 'ok' } as never);
		await githubActions.setupGitHub({ token: 't' } as never);
		expect(api.getGitHubSettings).toHaveBeenCalledWith(true);
		expect(api.getGitHubConnectionStatus).toHaveBeenCalledWith(true);
		expect(githubStore.settings).toEqual(settings);
	});

	it('re-reads settings and status after an update', async () => {
		api.updateGitHubSettings.mockResolvedValueOnce(settings);

		await expect(githubActions.updateSettings({ branch: 'dev' } as never)).resolves.toEqual({
			settings,
			connectionStatus: connected
		});
		expect(api.updateGitHubSettings).toHaveBeenCalledWith({ branch: 'dev' });
	});

	describe('testConnection', () => {
		it('stores the test result', async () => {
			api.testGitHubConnection.mockResolvedValueOnce({ success: true, message: 'ok' } as never);

			await githubActions.testConnection('t', 'o', 'r');

			expect(api.testGitHubConnection).toHaveBeenCalledWith('t', 'o', 'r');
			expect(githubStore.connectionTest).toEqual({ success: true, message: 'ok' });
			expect(githubStore.testingConnection).toBe(false);
		});

		it('records a failed test with the API message', async () => {
			api.testGitHubConnection.mockRejectedValueOnce(apiError('Bad credentials', 'UNAUTHORIZED'));

			await expect(githubActions.testConnection('t', 'o', 'r')).rejects.toThrow();
			expect(githubStore.connectionTest).toEqual({ success: false, message: 'Bad credentials' });
			expect(githubStore.error).toBe('Bad credentials');

			githubActions.clearConnectionTest();
			expect(githubStore.connectionTest).toBeNull();
		});
	});

	describe('syncToGitHub', () => {
		it('stores the result and refreshes the status', async () => {
			const result = { success: true, message: 'Synced' } as never;
			api.syncToGitHub.mockResolvedValueOnce(result);

			await githubActions.syncToGitHub();

			expect(githubStore.lastSyncResult).toEqual(result);
			expect(api.getGitHubConnectionStatus).toHaveBeenCalledWith(true);
			expect(githubStore.syncing).toBe(false);
		});

		it.each([
			['Git repository is not properly initialized', 'Git repository is not properly set up'],
			['Failed to access GitHub repository o/r', 'Cannot access GitHub repository'],
			['failed to setup git remote: x', 'Could not configure Git remote'],
			['failed to commit changes', 'Could not create local Git commit'],
			['failed to push to github', 'Could not push changes to GitHub'],
			['GitHub integration is not enabled', 'GitHub integration is not properly configured']
		])('explains "%s"', async (message, explanation) => {
			api.syncToGitHub.mockRejectedValueOnce(apiError(message, 'VALIDATION_ERROR'));

			await expect(githubActions.syncToGitHub()).rejects.toThrow();
			expect(githubStore.error).toContain(explanation);
			expect(githubStore.syncing).toBe(false);
		});

		it('shows the API error text, not the raw envelope, for other failures', async () => {
			api.syncToGitHub.mockRejectedValueOnce(
				apiError('An internal error occurred', 'INTERNAL_ERROR')
			);

			await expect(githubActions.syncToGitHub()).rejects.toThrow();
			expect(githubStore.error).toBe('An internal error occurred');
		});
	});

	it('clears test and sync results on disconnect', async () => {
		api.disconnectGitHub.mockResolvedValueOnce({
			message: 'bye',
			settings: { enabled: false },
			connection: { connected: false }
		} as never);

		await githubActions.disconnect();

		expect(githubStore.settings).toEqual({ enabled: false });
		expect(githubStore.connectionStatus).toEqual({ connected: false });
		expect(githubStore.connectionTest).toBeNull();
		expect(githubStore.lastSyncResult).toBeNull();
	});

	it('refresh tolerates an unavailable connection status or settings', async () => {
		api.getGitHubConnectionStatus.mockRejectedValueOnce(apiError('locked', 'FORBIDDEN'));
		await expect(githubActions.refresh()).resolves.toBeUndefined();
		expect(console.debug).toHaveBeenCalled();

		api.getGitHubSettings.mockRejectedValueOnce(apiError('down', 'INTERNAL_ERROR'));
		await expect(githubActions.refresh()).resolves.toBeUndefined();
		expect(console.error).toHaveBeenCalled();
	});

	describe('git health and repair', () => {
		it('records a healthy repository', async () => {
			api.checkGitHealth.mockResolvedValueOnce({ healthy: true });

			await githubActions.checkGitHealth();

			expect(githubStore.gitHealthStatus).toEqual({ healthy: true, error: undefined });
			expect(githubStore.checkingHealth).toBe(false);
			githubActions.clearHealthStatus();
			expect(githubStore.gitHealthStatus).toBeNull();
		});

		it('rejects and records an unhealthy repository', async () => {
			api.checkGitHealth.mockResolvedValueOnce({ healthy: false, error: 'corrupt index' });

			await expect(githubActions.checkGitHealth()).rejects.toThrow('corrupt index');
			expect(githubStore.gitHealthStatus).toEqual({ healthy: false, error: 'corrupt index' });
		});

		it('records a failed health request with the API message', async () => {
			api.checkGitHealth.mockRejectedValueOnce(apiError('No repo', 'RESOURCE_NOT_FOUND'));

			await expect(githubActions.checkGitHealth()).rejects.toThrow();
			expect(githubStore.gitHealthStatus).toEqual({ healthy: false, error: 'No repo' });
		});

		it('re-checks health after a successful repair', async () => {
			api.repairGitRepository.mockResolvedValueOnce({ success: true, message: 'fixed' });
			api.checkGitHealth.mockResolvedValueOnce({ healthy: true });

			await githubActions.repairRepository();

			expect(githubStore.lastRepairResult).toEqual({ success: true, message: 'fixed' });
			expect(api.checkGitHealth).toHaveBeenCalledTimes(1);
			expect(githubStore.repairingRepository).toBe(false);
		});

		it('does not re-check after an unsuccessful repair, and records failures', async () => {
			api.repairGitRepository.mockResolvedValueOnce({ success: false, message: 'no' });
			await githubActions.repairRepository();
			expect(api.checkGitHealth).not.toHaveBeenCalled();

			api.repairGitRepository.mockRejectedValueOnce(apiError('Repair failed', 'INTERNAL_ERROR'));
			await expect(githubActions.repairRepository()).rejects.toThrow();
			expect(githubStore.lastRepairResult).toEqual({ success: false, error: 'Repair failed' });

			githubActions.clearRepairResult();
			expect(githubStore.lastRepairResult).toBeNull();
		});
	});
});
