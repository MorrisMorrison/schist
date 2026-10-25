import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { tick } from 'svelte';
import { apiClient } from '$lib/api/client';
import { githubActions, githubStore } from '$lib/stores/github.svelte';
import type { GitHubConnectionStatus, GitHubSettings } from '$lib/api/types';
import GitHubSettingsSection from './GitHubSettingsSection.svelte';

vi.mock('$lib/api/client', () => ({
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

const settings: GitHubSettings = {
	enabled: true,
	owner: 'octo',
	repository: 'wiki',
	branch: 'main',
	auto_sync: false,
	sync_on_save: false,
	last_sync: '2024-05-01T12:00:00Z'
};
const connected: GitHubConnectionStatus = {
	connected: true,
	token_exists: true,
	pending_changes: 0
};
const disconnected: GitHubConnectionStatus = { ...connected, connected: false };

async function seedConnected(overrides: Partial<GitHubSettings> = {}) {
	vi.mocked(apiClient.getGitHubSettings).mockResolvedValue({ ...settings, ...overrides });
	vi.mocked(apiClient.getGitHubConnectionStatus).mockResolvedValue(connected);
	await githubActions.refresh();
}

async function resetGitHubStore() {
	// The store has no reset; disconnecting with an empty response clears the
	// settings, status, connection test and last sync result.
	vi.mocked(apiClient.disconnectGitHub).mockResolvedValue({
		settings: null,
		connection: null
	} as never);
	await githubActions.disconnect();
	githubActions.clearError();
	githubActions.clearHealthStatus();
	githubActions.clearRepairResult();
}

describe('GitHubSettingsSection', () => {
	const input = (id: string) => screen.getByTestId(id);

	async function fillSetupForm() {
		await userEvent.type(input('github-token-input'), ' ghp_token ');
		await userEvent.type(input('github-owner-input'), ' octo ');
		await userEvent.type(input('github-repository-input'), ' wiki ');
	}

	beforeEach(async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(console, 'debug').mockImplementation(() => {});
		await resetGitHubStore();
		vi.clearAllMocks();
		vi.mocked(apiClient.getGitHubSettings).mockResolvedValue(null as never);
		vi.mocked(apiClient.getGitHubConnectionStatus).mockResolvedValue(disconnected);
	});

	afterEach(async () => {
		cleanup();
		await resetGitHubStore();
		vi.clearAllMocks();
		vi.restoreAllMocks();
	});

	describe('when not connected', () => {
		it('refreshes on mount and keeps the sync tab disabled', async () => {
			render(GitHubSettingsSection);
			await waitFor(() => expect(apiClient.getGitHubSettings).toHaveBeenCalled());
			expect(input('github-sync-tab')).toBeDisabled();
			expect(input('github-setup-button')).toHaveTextContent('Setup GitHub');
			expect(input('github-setup-button')).toBeDisabled();
			expect(input('github-test-connection-button')).toBeDisabled();
			expect(screen.queryByTestId('github-disconnect-button')).not.toBeInTheDocument();
		});

		it('does not refresh on mount when the store already has data', async () => {
			await seedConnected();
			vi.clearAllMocks();
			render(GitHubSettingsSection);
			// onMount has run once render returns; check before the store's own delayed refresh.
			await tick();
			expect(apiClient.getGitHubSettings).not.toHaveBeenCalled();
		});

		it('enables testing once token, owner and repository are filled', async () => {
			vi.mocked(apiClient.testGitHubConnection).mockResolvedValue({
				success: true,
				message: 'Repository is accessible'
			});
			render(GitHubSettingsSection);
			await fillSetupForm();
			expect(input('github-test-connection-button')).toBeEnabled();
			await userEvent.click(input('github-test-connection-button'));
			expect(apiClient.testGitHubConnection).toHaveBeenCalledWith('ghp_token', 'octo', 'wiki');
			expect(await screen.findByTestId('github-connection-test-message')).toHaveTextContent(
				'Repository is accessible'
			);
			expect(screen.getByTestId('github-connection-test-result')).toHaveAttribute(
				'data-variant',
				'success'
			);
		});

		it('shows a failed connection test', async () => {
			vi.mocked(apiClient.testGitHubConnection).mockRejectedValue(
				new Error(JSON.stringify({ error: 'Bad credentials' }))
			);
			render(GitHubSettingsSection);
			await fillSetupForm();
			await userEvent.click(input('github-test-connection-button'));
			expect(await screen.findByTestId('github-connection-test-message')).toHaveTextContent(
				'Bad credentials'
			);
			// The store error and the test result are both alerts.
			expect(screen.getAllByRole('alert')).toHaveLength(2);
			expect(screen.getByTestId('github-connection-test-result')).toHaveAttribute(
				'data-variant',
				'destructive'
			);
		});

		it('validates the branch on submit', async () => {
			render(GitHubSettingsSection);
			await fillSetupForm();
			await userEvent.clear(input('github-branch-input'));
			// The input is `required`; skip native validation to reach the component's check.
			input('github-setup-button').closest('form')!.noValidate = true;
			await userEvent.click(input('github-setup-button'));
			expect(await screen.findByText('Branch name is required')).toBeInTheDocument();
			expect(apiClient.setupGitHub).not.toHaveBeenCalled();
		});

		it('validates the sync interval in automatic mode', async () => {
			render(GitHubSettingsSection);
			await fillSetupForm();
			await userEvent.selectOptions(screen.getByLabelText('Backup Mode'), 'auto');
			const interval = screen.getByLabelText('Sync Interval (minutes)');
			await userEvent.clear(interval);
			await userEvent.type(interval, '2');
			input('github-setup-button').closest('form')!.noValidate = true;
			await userEvent.click(input('github-setup-button'));
			expect(
				await screen.findByText('Sync interval must be at least 5 minutes')
			).toBeInTheDocument();
		});

		it('sets up GitHub with the entered values', async () => {
			vi.mocked(apiClient.setupGitHub).mockResolvedValue({
				settings: { ...settings, auto_sync: true, branch: 'docs' },
				connection: connected
			} as never);
			render(GitHubSettingsSection);
			await fillSetupForm();
			await userEvent.clear(input('github-branch-input'));
			await userEvent.type(input('github-branch-input'), 'docs');
			await userEvent.selectOptions(screen.getByLabelText('Backup Mode'), 'auto');
			await userEvent.click(screen.getByLabelText("Create repository if it doesn't exist"));
			expect(screen.getByLabelText('Make repository private')).toBeChecked();
			await userEvent.click(input('github-setup-button'));

			expect(apiClient.setupGitHub).toHaveBeenCalledWith({
				token: 'ghp_token',
				owner: 'octo',
				repo: 'wiki',
				branch: 'docs',
				auto_sync: true,
				sync_on_save: false
			});
			expect(await screen.findByTestId('github-status-connected')).toBeInTheDocument();
			expect(input('github-setup-button')).toHaveTextContent('Update Settings');
		});

		it('shows the store error when setup fails', async () => {
			vi.mocked(apiClient.setupGitHub).mockRejectedValue(
				new Error(JSON.stringify({ error: 'Repository not found' }))
			);
			render(GitHubSettingsSection);
			await fillSetupForm();
			await userEvent.click(input('github-setup-button'));
			expect(await screen.findByRole('alert')).toHaveTextContent('Repository not found');
			expect(console.error).toHaveBeenCalledWith('Error setting up github');
		});

		it('explains that sync needs a connection', async () => {
			render(GitHubSettingsSection);
			// The tab button is disabled, so switch tabs programmatically.
			input('github-sync-tab').removeAttribute('disabled');
			await userEvent.click(input('github-sync-tab'));
			expect(screen.getByText(/GitHub is not connected/)).toBeInTheDocument();
			expect(input('github-sync-now-button')).toBeDisabled();
		});
	});

	describe('when connected', () => {
		beforeEach(async () => {
			await seedConnected();
		});

		it('shows the status, last sync and repository link', async () => {
			render(GitHubSettingsSection);
			expect(input('github-status-connected')).toHaveTextContent('Connected');
			expect(input('github-owner-input')).toHaveValue('octo');
			expect(input('github-repository-input')).toHaveValue('wiki');
			expect(input('github-token-input')).toHaveValue('');
			expect(screen.getByRole('link', { name: 'octo/wiki' })).toHaveAttribute(
				'href',
				'https://github.com/octo/wiki'
			);
			expect(screen.getByText(new Date(settings.last_sync!).toLocaleString())).toBeInTheDocument();
			expect(screen.queryByLabelText("Create repository if it doesn't exist")).toBeNull();
			expect(input('github-setup-button')).toBeDisabled();
		});

		it('shows "Never" for a missing or epoch last sync and the last sync error', async () => {
			await seedConnected({ last_sync: '1970-01-01T00:00:00Z', last_sync_error: 'push rejected' });
			render(GitHubSettingsSection);
			expect(screen.getByText('Never')).toBeInTheDocument();
			expect(screen.getByText('push rejected')).toBeInTheDocument();
		});

		it('updates branch and backup mode', async () => {
			vi.mocked(apiClient.updateGitHubSettings).mockResolvedValue(undefined as never);
			render(GitHubSettingsSection);
			await userEvent.selectOptions(screen.getByLabelText('Backup Mode'), 'auto');
			expect(input('github-setup-button')).toBeEnabled();
			await userEvent.click(input('github-setup-button'));
			expect(apiClient.updateGitHubSettings).toHaveBeenCalledWith({
				auto_sync: true,
				branch: 'main'
			});
		});

		it('logs when updating fails', async () => {
			vi.mocked(apiClient.updateGitHubSettings).mockRejectedValue(new Error('nope'));
			render(GitHubSettingsSection);
			await userEvent.clear(input('github-branch-input'));
			await userEvent.type(input('github-branch-input'), 'dev');
			await userEvent.click(input('github-setup-button'));
			await waitFor(() =>
				expect(console.error).toHaveBeenCalledWith('Error updating github settings')
			);
			expect(screen.getByRole('alert')).toHaveTextContent('nope');
		});

		it('disconnects and returns to the setup tab', async () => {
			vi.mocked(apiClient.disconnectGitHub).mockResolvedValue({
				settings: { ...settings, enabled: false },
				connection: disconnected
			} as never);
			render(GitHubSettingsSection);
			await userEvent.click(input('github-sync-tab'));
			await userEvent.click(input('github-setup-tab'));
			await userEvent.click(input('github-disconnect-button'));
			expect(apiClient.disconnectGitHub).toHaveBeenCalled();
			await waitFor(() => expect(input('github-sync-tab')).toBeDisabled());
			expect(input('github-setup-button')).toHaveTextContent('Setup GitHub');
		});

		it('logs when disconnecting fails', async () => {
			vi.mocked(apiClient.disconnectGitHub).mockRejectedValueOnce(new Error('offline'));
			render(GitHubSettingsSection);
			await userEvent.click(input('github-disconnect-button'));
			await waitFor(() =>
				expect(console.error).toHaveBeenCalledWith('Error disconnecting from github')
			);
		});

		it('syncs now and shows the result with errors', async () => {
			vi.mocked(apiClient.syncToGitHub).mockResolvedValue({
				success: false,
				message: 'Partial sync',
				syncedFiles: 3,
				errors: ['a.md failed'],
				timestamp: '2024-05-02T12:00:00Z'
			});
			render(GitHubSettingsSection);
			await userEvent.click(input('github-sync-tab'));
			expect(screen.getByText(/Manual sync will immediately push/)).toBeInTheDocument();
			await userEvent.click(input('github-sync-now-button'));
			expect(apiClient.syncToGitHub).toHaveBeenCalled();
			expect(await screen.findByText('Last Sync Failed')).toBeInTheDocument();
			expect(screen.getByText('Partial sync')).toBeInTheDocument();
			expect(screen.getByText('Files synced: 3')).toBeInTheDocument();
			expect(screen.getByRole('listitem')).toHaveTextContent('a.md failed');
		});

		it('shows a successful sync and a syncing state', async () => {
			let resolve!: (v: unknown) => void;
			vi.mocked(apiClient.syncToGitHub).mockReturnValue(new Promise((r) => (resolve = r)) as never);
			render(GitHubSettingsSection);
			await userEvent.click(input('github-sync-tab'));
			await userEvent.click(input('github-sync-now-button'));
			expect(input('github-sync-now-button')).toHaveTextContent('Syncing...');
			expect(input('github-sync-now-button')).toBeDisabled();
			resolve({ success: true, message: 'All good', timestamp: '2024-05-02T12:00:00Z' });
			expect(await screen.findByText('Last Sync Successful')).toBeInTheDocument();
		});

		it('logs when syncing fails', async () => {
			vi.mocked(apiClient.syncToGitHub).mockRejectedValue(new Error('failed to push to github'));
			render(GitHubSettingsSection);
			await userEvent.click(input('github-sync-tab'));
			await userEvent.click(input('github-sync-now-button'));
			await waitFor(() => expect(console.error).toHaveBeenCalledWith('Error syncing with github'));
			expect(githubStore.error).toMatch(/Could not push changes/);
		});

		it('checks repository health', async () => {
			vi.mocked(apiClient.checkGitHealth).mockResolvedValue({ healthy: true } as never);
			render(GitHubSettingsSection);
			await userEvent.click(input('github-sync-tab'));
			await userEvent.click(screen.getByRole('button', { name: 'Check Health' }));
			expect(await screen.findByText('Repository is healthy')).toBeInTheDocument();
			expect(screen.queryByRole('button', { name: 'Repair' })).not.toBeInTheDocument();
		});

		it('reports an unhealthy repository and repairs it', async () => {
			vi.mocked(apiClient.checkGitHealth)
				.mockResolvedValueOnce({ healthy: false, error: 'missing HEAD' } as never)
				.mockResolvedValue({ healthy: true } as never);
			vi.mocked(apiClient.repairGitRepository).mockResolvedValue({
				success: true,
				message: 'Re-initialised repository'
			} as never);
			render(GitHubSettingsSection);
			await userEvent.click(input('github-sync-tab'));
			await userEvent.click(screen.getByRole('button', { name: 'Check Health' }));
			expect(await screen.findByText('Repository health issues detected')).toBeInTheDocument();
			expect(screen.getByText(/Health Check Error: missing HEAD/)).toBeInTheDocument();
			await waitFor(() =>
				expect(console.error).toHaveBeenCalledWith('Error checking Git repository health')
			);

			await userEvent.click(screen.getByRole('button', { name: 'Repair' }));
			expect(await screen.findByText('Repair Successful')).toBeInTheDocument();
			expect(screen.getByText('Re-initialised repository')).toBeInTheDocument();
			expect(await screen.findByText('Repository is healthy')).toBeInTheDocument();
		});

		it('shows a failed repair', async () => {
			vi.mocked(apiClient.checkGitHealth).mockResolvedValue({
				healthy: false,
				error: 'corrupt'
			} as never);
			vi.mocked(apiClient.repairGitRepository).mockRejectedValue(
				new Error(JSON.stringify({ error: 'Cannot repair' }))
			);
			render(GitHubSettingsSection);
			await userEvent.click(input('github-sync-tab'));
			await userEvent.click(screen.getByRole('button', { name: 'Check Health' }));
			await userEvent.click(await screen.findByRole('button', { name: 'Repair' }));
			expect(await screen.findByText('Repair Failed')).toBeInTheDocument();
			expect(screen.getByText('Cannot repair')).toBeInTheDocument();
			await waitFor(() =>
				expect(console.error).toHaveBeenCalledWith('Error repairing Git repository')
			);
		});

		it('clears errors and test results when returning to the setup tab', async () => {
			vi.mocked(apiClient.testGitHubConnection).mockResolvedValue({
				success: true,
				message: 'ok'
			});
			render(GitHubSettingsSection);
			await userEvent.type(input('github-token-input'), 'new-token');
			await userEvent.click(input('github-test-connection-button'));
			expect(await screen.findByTestId('github-connection-test-result')).toBeInTheDocument();
			await userEvent.click(input('github-setup-tab'));
			expect(screen.queryByTestId('github-connection-test-result')).not.toBeInTheDocument();
		});
	});
});
