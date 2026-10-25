import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { apiClient } from '$lib/api/client';
import { registerPasskey } from '$lib/utils/webauthn';
import { passkeyStore } from '$lib/stores/passkeys.svelte';
import { waitForDialogFocus } from '$lib/test/dialog';
import PasskeyManager from './PasskeyManager.svelte';

vi.mock('$lib/api/client', () => ({
	apiClient: { getPasskeyStatus: vi.fn(), listPasskeys: vi.fn(), deletePasskey: vi.fn() }
}));

vi.mock('$lib/utils/webauthn', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/utils/webauthn')>();
	return { ...actual, registerPasskey: vi.fn(), isWebAuthnSupported: vi.fn(() => true) };
});

const passkeys = [
	{ id: 'pk-1', name: 'Laptop', createdAt: '2024-05-01T10:00:00Z' },
	{ id: 'pk-2', name: 'Phone', createdAt: '2024-06-01T10:00:00Z' }
];

describe('PasskeyManager', () => {
	beforeEach(() => {
		vi.mocked(apiClient.getPasskeyStatus).mockResolvedValue({
			hasPasskeys: true,
			isUnlocked: true
		} as never);
		vi.mocked(apiClient.listPasskeys).mockResolvedValue({ passkeys } as never);
		vi.mocked(apiClient.deletePasskey).mockResolvedValue(undefined as never);
	});

	afterEach(() => {
		cleanup();
		document.body.style.pointerEvents = '';
		passkeyStore.reset();
		vi.clearAllMocks();
		vi.restoreAllMocks();
	});

	it('loads status and lists passkeys', async () => {
		render(PasskeyManager);
		expect(screen.getByText('Passkey Security')).toBeInTheDocument();
		expect(await screen.findByText('Laptop')).toBeInTheDocument();
		expect(screen.getByText('Phone')).toBeInTheDocument();
		expect(screen.getByText('Security Note')).toBeInTheDocument();
		expect(apiClient.getPasskeyStatus).toHaveBeenCalled();
		expect(apiClient.listPasskeys).toHaveBeenCalled();
	});

	it('shows the setup empty state when no passkeys exist', async () => {
		vi.mocked(apiClient.getPasskeyStatus).mockResolvedValue({
			hasPasskeys: false,
			isUnlocked: false
		} as never);
		vi.mocked(apiClient.listPasskeys).mockResolvedValue({ passkeys: [] } as never);
		render(PasskeyManager);
		expect(await screen.findByText('Secure Your Secrets')).toBeInTheDocument();
		await userEvent.click(screen.getByRole('button', { name: /create your first passkey/i }));
		await waitForDialogFocus();
		expect(screen.getByRole('heading', { name: 'Set Up Passkey Security' })).toBeInTheDocument();
	});

	it('shows the loading row while passkeys load', async () => {
		vi.mocked(apiClient.listPasskeys).mockReturnValue(new Promise(() => {}));
		render(PasskeyManager);
		expect(await screen.findByText('Loading passkeys...')).toBeInTheDocument();
	});

	it('shows the store error', async () => {
		vi.mocked(apiClient.listPasskeys).mockRejectedValue(
			new Error(JSON.stringify({ error: 'Passkeys unavailable' }))
		);
		render(PasskeyManager);
		expect(await screen.findByText('Passkeys unavailable')).toBeInTheDocument();
	});

	it('deletes a passkey after confirmation and reloads', async () => {
		const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
		render(PasskeyManager);
		await screen.findByText('Laptop');
		await userEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
		expect(confirm).toHaveBeenCalledWith('Delete passkey "Laptop"? This cannot be undone.');
		expect(apiClient.deletePasskey).toHaveBeenCalledWith('pk-1');
		await waitFor(() => expect(apiClient.listPasskeys).toHaveBeenCalledTimes(2));
	});

	it('does nothing when deletion is not confirmed', async () => {
		vi.spyOn(window, 'confirm').mockReturnValue(false);
		render(PasskeyManager);
		await screen.findByText('Laptop');
		await userEvent.click(screen.getAllByRole('button', { name: 'Delete' })[1]);
		expect(apiClient.deletePasskey).not.toHaveBeenCalled();
	});

	it('disables the button while deleting and shows a failure', async () => {
		vi.spyOn(window, 'confirm').mockReturnValue(true);
		let reject!: (e: Error) => void;
		vi.mocked(apiClient.deletePasskey).mockReturnValue(new Promise((_, r) => (reject = r)));
		render(PasskeyManager);
		await screen.findByText('Laptop');
		const del = screen.getAllByRole('button', { name: 'Delete' })[0];
		await userEvent.click(del);
		expect(del).toBeDisabled();
		reject(new Error(JSON.stringify({ error: 'Cannot delete last passkey' })));
		expect(await screen.findByText('Cannot delete last passkey')).toBeInTheDocument();
		await waitFor(() => expect(del).toBeEnabled());
	});

	it('adds a passkey through the setup modal and reloads', async () => {
		vi.mocked(registerPasskey).mockResolvedValue('pk-3');
		render(PasskeyManager);
		await screen.findByText('Laptop');
		await userEvent.click(screen.getByRole('button', { name: /add passkey/i }));
		await waitForDialogFocus();
		await userEvent.type(screen.getByLabelText('Passkey Name'), 'Tablet{Enter}');
		expect(await screen.findByText('Passkey Created Successfully!')).toBeInTheDocument();
		const callsBefore = vi.mocked(apiClient.listPasskeys).mock.calls.length;
		await waitFor(
			() =>
				expect(vi.mocked(apiClient.listPasskeys).mock.calls.length).toBeGreaterThan(callsBefore),
			{ timeout: 3000 }
		);
		await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
	});
});
