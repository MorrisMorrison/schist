import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { apiClient } from '$lib/api/client';
import { authenticateWithPasskey } from '$lib/utils/webauthn';
import { authActions } from '$lib/stores/auth.svelte';
import { secretStore } from '$lib/stores/secrets.svelte';
import { passkeyStore } from '$lib/stores/passkeys.svelte';
import { waitForDialogFocus } from '$lib/test/dialog';
import type { SecretsStatus } from '$lib/api/types';
import SecretManager from './SecretManager.svelte';

vi.mock('$lib/api/client', () => ({
	apiClient: {
		setAuthToken: vi.fn(),
		getSecretsStatus: vi.fn(),
		listSecrets: vi.fn(),
		lockSecrets: vi.fn(),
		deleteSecret: vi.fn(),
		updateSecret: vi.fn(),
		createSecret: vi.fn(),
		unlockWithPasskey: vi.fn(),
		getPasskeyStatus: vi.fn()
	}
}));

vi.mock('$lib/utils/webauthn', async (importOriginal) =>
	(await import('$lib/test/webauthn-mock')).mockWebAuthn(importOriginal)
);

function status(overrides: Partial<SecretsStatus> = {}): SecretsStatus {
	return {
		unlocked: false,
		has_secrets: false,
		requires_password: false,
		has_passkeys: false,
		requires_setup: false,
		...overrides
	} as SecretsStatus;
}

const unlocked = status({ unlocked: true, has_secrets: true, has_passkeys: true });

describe('SecretManager', () => {
	function signIn() {
		authActions.setAuth('token', {
			username: 'admin',
			created_at: '2024-01-01T00:00:00Z',
			last_login: ''
		});
	}

	function secretRow(key: string) {
		return screen.getByText(key, { selector: 'code' }).closest('.rounded-lg') as HTMLElement;
	}

	beforeEach(() => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.mocked(apiClient.getSecretsStatus).mockResolvedValue(unlocked);
		vi.mocked(apiClient.listSecrets).mockResolvedValue({ secrets: ['api_key', 'db_url'] } as never);
		vi.mocked(apiClient.lockSecrets).mockResolvedValue(undefined as never);
		vi.mocked(apiClient.deleteSecret).mockResolvedValue(undefined as never);
		vi.mocked(apiClient.unlockWithPasskey).mockResolvedValue(undefined as never);
		vi.mocked(apiClient.getPasskeyStatus).mockResolvedValue({ isUnlocked: true } as never);
		signIn();
	});

	afterEach(() => {
		cleanup();
		authActions.clearAuth();
		secretStore.reset();
		passkeyStore.reset();
		vi.clearAllMocks();
		vi.restoreAllMocks();
	});

	it('does not load anything when signed out', async () => {
		authActions.clearAuth();
		render(SecretManager);
		expect(screen.getByText('No Secrets')).toBeInTheDocument();
		await new Promise((r) => setTimeout(r, 50));
		expect(apiClient.getSecretsStatus).not.toHaveBeenCalled();
	});

	it('loads the status and the secret list when already unlocked', async () => {
		render(SecretManager);
		expect(await screen.findByText('Your Secrets (2)')).toBeInTheDocument();
		expect(screen.getByText('Secrets Unlocked')).toBeInTheDocument();
		expect(screen.getByText('{{secret:api_key}}')).toBeInTheDocument();
		expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
		expect(screen.getByText('Usage')).toBeInTheDocument();
	});

	it('shows the setup empty state when there are no secrets', async () => {
		vi.mocked(apiClient.getSecretsStatus).mockResolvedValue(status());
		render(SecretManager);
		expect(await screen.findByText('Secure Your API Keys & Secrets')).toBeInTheDocument();
		expect(apiClient.listSecrets).not.toHaveBeenCalled();
		await userEvent.click(screen.getByRole('button', { name: /set up passkey/i }));
		await waitForDialogFocus();
		expect(
			screen.getByRole('heading', { name: 'Unlock Secrets with Passkey' })
		).toBeInTheDocument();
	});

	it('shows the locked state and unlocks through the passkey modal', async () => {
		vi.mocked(apiClient.getSecretsStatus)
			.mockResolvedValueOnce(status({ has_secrets: true }))
			.mockResolvedValue(unlocked);
		vi.mocked(authenticateWithPasskey).mockResolvedValue({
			credentialId: 'c',
			authTicket: 't'
		} as never);
		render(SecretManager);

		// Status line and the locked empty state.
		await waitFor(() => expect(screen.getAllByText('Secrets Locked')).toHaveLength(2));
		await userEvent.click(screen.getByRole('button', { name: 'Unlock Secrets' }));
		await waitForDialogFocus();
		await userEvent.click(screen.getByRole('button', { name: 'Unlock with Passkey' }));

		expect(apiClient.unlockWithPasskey).toHaveBeenCalledWith({ authTicket: 't' });
		expect(await screen.findByText('Your Secrets (2)', {}, { timeout: 4000 })).toBeInTheDocument();
	});

	it('opens the create modal after unlocking when there are no secrets yet', async () => {
		vi.mocked(apiClient.getSecretsStatus)
			.mockResolvedValueOnce(status())
			.mockResolvedValue(status({ unlocked: true }));
		vi.mocked(apiClient.listSecrets).mockResolvedValue({ secrets: [] } as never);
		vi.mocked(authenticateWithPasskey).mockResolvedValue({
			credentialId: 'c',
			authTicket: 't'
		} as never);
		render(SecretManager);
		await userEvent.click(await screen.findByRole('button', { name: /set up passkey/i }));
		await waitForDialogFocus();
		await userEvent.click(screen.getByRole('button', { name: 'Unlock with Passkey' }));
		expect(
			await screen.findByRole('heading', { name: 'Create New Secret' }, { timeout: 4000 })
		).toBeInTheDocument();
	});

	it('opens the unlock modal from the toggle when locked', async () => {
		vi.mocked(apiClient.getSecretsStatus).mockResolvedValue(status({ requires_password: true }));
		render(SecretManager);
		await screen.findByRole('button', { name: 'Unlock Secrets' });
		await userEvent.click(screen.getByRole('switch'));
		await waitForDialogFocus();
		expect(
			screen.getByRole('heading', { name: 'Unlock Secrets with Passkey' })
		).toBeInTheDocument();
	});

	it('locks secrets from the toggle', async () => {
		render(SecretManager);
		await screen.findByText('Your Secrets (2)');
		vi.mocked(apiClient.getSecretsStatus).mockResolvedValue(status({ has_secrets: true }));
		await userEvent.click(screen.getByRole('switch'));
		expect(apiClient.lockSecrets).toHaveBeenCalled();
		expect(await screen.findByRole('button', { name: 'Unlock Secrets' })).toBeInTheDocument();
	});

	it('logs a lock failure and shows the store error', async () => {
		render(SecretManager);
		await screen.findByText('Your Secrets (2)');
		vi.mocked(apiClient.lockSecrets).mockRejectedValue(
			new Error(JSON.stringify({ error: 'Lock failed' }))
		);
		await userEvent.click(screen.getByRole('switch'));
		expect(await screen.findByText('Lock failed')).toBeInTheDocument();
		expect(console.error).toHaveBeenCalledWith('Failed to lock secrets:', expect.any(Error));
	});

	it('copies a secret reference', async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({ writeText } as never);
		render(SecretManager);
		await screen.findByText('Your Secrets (2)');
		await userEvent.click(within(secretRow('db_url')).getByTitle('Copy reference'));
		expect(writeText).toHaveBeenCalledWith('{{secret:db_url}}');
	});

	it('edits a secret through the edit modal', async () => {
		vi.mocked(apiClient.updateSecret).mockResolvedValue(undefined as never);
		render(SecretManager);
		await screen.findByText('Your Secrets (2)');
		await userEvent.click(within(secretRow('api_key')).getByRole('button', { name: 'Edit' }));
		await waitForDialogFocus();
		expect(screen.getByRole('heading', { name: 'Edit Secret: api_key' })).toBeInTheDocument();
		await userEvent.type(screen.getByLabelText('Value'), 'new-value');
		await userEvent.click(screen.getByRole('button', { name: 'Update Secret' }));
		expect(apiClient.updateSecret).toHaveBeenCalledWith('api_key', { value: 'new-value' });
		await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
	});

	it('creates a secret from the Add Secret button', async () => {
		vi.mocked(apiClient.createSecret).mockResolvedValue(undefined as never);
		render(SecretManager);
		await screen.findByText('Your Secrets (2)');
		await userEvent.click(screen.getByRole('button', { name: 'Add Secret' }));
		await waitForDialogFocus();
		await userEvent.type(screen.getByLabelText('Key'), 'token');
		await userEvent.type(screen.getByLabelText('Value'), 'abc');
		await userEvent.click(screen.getByRole('button', { name: 'Create Secret' }));
		expect(apiClient.createSecret).toHaveBeenCalledWith({ key: 'token', value: 'abc' });
		await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
	});

	it('deletes a secret after confirmation', async () => {
		const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
		render(SecretManager);
		await screen.findByText('Your Secrets (2)');
		vi.mocked(apiClient.listSecrets).mockResolvedValue({ secrets: ['api_key'] } as never);
		await userEvent.click(within(secretRow('db_url')).getByRole('button', { name: 'Delete' }));
		expect(confirm).toHaveBeenCalledWith('Delete secret "db_url"? This cannot be undone.');
		expect(apiClient.deleteSecret).toHaveBeenCalledWith('db_url');
		expect(await screen.findByText('Your Secrets (1)')).toBeInTheDocument();
	});

	it('keeps the secret when deletion is cancelled', async () => {
		vi.spyOn(window, 'confirm').mockReturnValue(false);
		render(SecretManager);
		await screen.findByText('Your Secrets (2)');
		await userEvent.click(within(secretRow('db_url')).getByRole('button', { name: 'Delete' }));
		expect(apiClient.deleteSecret).not.toHaveBeenCalled();
	});

	it('disables the row while deleting and shows a failure', async () => {
		vi.spyOn(window, 'confirm').mockReturnValue(true);
		let reject!: (e: Error) => void;
		vi.mocked(apiClient.deleteSecret).mockReturnValue(new Promise((_, r) => (reject = r)));
		render(SecretManager);
		await screen.findByText('Your Secrets (2)');
		const row = secretRow('db_url');
		await userEvent.click(within(row).getByRole('button', { name: 'Delete' }));
		expect(within(row).getByRole('button', { name: 'Delete' })).toBeDisabled();
		expect(within(row).getByRole('button', { name: 'Edit' })).toBeDisabled();
		reject(new Error(JSON.stringify({ error: 'Delete failed' })));
		expect(await screen.findByText('Delete failed')).toBeInTheDocument();
		await waitFor(() =>
			expect(console.error).toHaveBeenCalledWith('Failed to delete secret:', expect.any(Error))
		);
		await waitFor(() => expect(within(row).getByRole('button', { name: 'Delete' })).toBeEnabled());
	});
});
