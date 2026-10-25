import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { waitForDialogFocus } from '$lib/test/dialog';
import { apiClient } from '$lib/api/client';
import { secretStore } from '$lib/stores/secrets.svelte';
import SecretEditModal from './SecretEditModal.svelte';

vi.mock('$lib/api/client', () => ({
	apiClient: {
		createSecret: vi.fn(),
		updateSecret: vi.fn(),
		listSecrets: vi.fn(),
		getSecretsStatus: vi.fn()
	}
}));

describe('SecretEditModal', () => {
	const onsuccess = vi.fn();
	const oncancel = vi.fn();

	async function renderModal(props: Record<string, unknown> = {}) {
		const result = render(SecretEditModal, {
			props: { open: true, onsuccess, oncancel, ...props }
		});
		if (screen.queryByRole('dialog')) await waitForDialogFocus();
		return result;
	}

	beforeEach(() => {
		vi.mocked(apiClient.createSecret).mockResolvedValue(undefined as never);
		vi.mocked(apiClient.updateSecret).mockResolvedValue(undefined as never);
		vi.mocked(apiClient.listSecrets).mockResolvedValue({ secrets: ['api_key'] } as never);
		vi.mocked(apiClient.getSecretsStatus).mockResolvedValue({ unlocked: true } as never);
	});

	afterEach(() => {
		cleanup();
		secretStore.reset();
		vi.clearAllMocks();
	});

	it('creates a new secret with trimmed key and value', async () => {
		await renderModal();
		expect(screen.getByRole('heading', { name: 'Create New Secret' })).toBeInTheDocument();
		const save = screen.getByRole('button', { name: 'Create Secret' });
		expect(save).toBeDisabled();

		await userEvent.type(screen.getByLabelText('Key'), ' api_key ');
		expect(save).toBeDisabled();
		expect(screen.getByText(/My API key is \{\{secret: api_key \}\}/)).toBeInTheDocument();
		await userEvent.type(screen.getByLabelText('Value'), ' s3cret ');
		expect(save).toBeEnabled();
		await userEvent.click(save);

		expect(apiClient.createSecret).toHaveBeenCalledWith({ key: 'api_key', value: 's3cret' });
		await vi.waitFor(() => expect(onsuccess).toHaveBeenCalledTimes(1));
		expect(oncancel).toHaveBeenCalledTimes(1);
	});

	it('saves on Enter in the key field', async () => {
		await renderModal();
		await userEvent.type(screen.getByLabelText('Value'), 'v');
		await userEvent.type(screen.getByLabelText('Key'), 'k{Enter}');
		expect(apiClient.createSecret).toHaveBeenCalledWith({ key: 'k', value: 'v' });
	});

	it('edits an existing secret with a locked key and empty value', async () => {
		await renderModal({ secretKey: 'db_url' });
		expect(screen.getByRole('heading', { name: 'Edit Secret: db_url' })).toBeInTheDocument();
		expect(screen.getByLabelText('Key')).toHaveValue('db_url');
		expect(screen.getByLabelText('Key')).toBeDisabled();
		expect(screen.getByLabelText('Value')).toHaveValue('');
		expect(screen.getByText('The secret key cannot be changed when editing.')).toBeInTheDocument();

		await userEvent.type(screen.getByLabelText('Value'), 'postgres://x');
		await userEvent.click(screen.getByRole('button', { name: 'Update Secret' }));
		expect(apiClient.updateSecret).toHaveBeenCalledWith('db_url', { value: 'postgres://x' });
		await vi.waitFor(() => expect(onsuccess).toHaveBeenCalled());
	});

	it('uses a custom title', async () => {
		await renderModal({ title: 'Rotate token' });
		expect(screen.getByRole('heading', { name: 'Rotate token' })).toBeInTheDocument();
	});

	it('shows the store error and stays open when saving fails', async () => {
		vi.mocked(apiClient.createSecret).mockRejectedValue(
			new Error(JSON.stringify({ error: 'Secrets are locked' }))
		);
		await renderModal();
		await userEvent.type(screen.getByLabelText('Key'), 'k');
		await userEvent.type(screen.getByLabelText('Value'), 'v');
		await userEvent.click(screen.getByRole('button', { name: 'Create Secret' }));
		expect(await screen.findByText('Secrets are locked')).toBeInTheDocument();
		expect(onsuccess).not.toHaveBeenCalled();

		await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(oncancel).toHaveBeenCalledTimes(1);
		expect(secretStore.error).toBeNull();
	});

	it('shows a busy label while saving', async () => {
		let resolve!: () => void;
		vi.mocked(apiClient.createSecret).mockReturnValue(
			new Promise<void>((r) => (resolve = r)) as never
		);
		await renderModal();
		await userEvent.type(screen.getByLabelText('Key'), 'k');
		await userEvent.type(screen.getByLabelText('Value'), 'v');
		await userEvent.click(screen.getByRole('button', { name: 'Create Secret' }));
		expect(screen.getByRole('button', { name: 'Creating...' })).toBeDisabled();
		resolve();
		await vi.waitFor(() => expect(onsuccess).toHaveBeenCalled());
	});
});
