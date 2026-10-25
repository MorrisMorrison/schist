import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { waitForDialogFocus } from '$lib/test/dialog';
import { apiClient } from '$lib/api/client';
import { registerPasskey, isWebAuthnSupported, WebAuthnError } from '$lib/utils/webauthn';
import { passkeyStore } from '$lib/stores/passkeys.svelte';
import PasskeySetupModal from './PasskeySetupModal.svelte';

vi.mock('$lib/api/client', () => ({
	apiClient: { listPasskeys: vi.fn(), getPasskeyStatus: vi.fn() }
}));

vi.mock('$lib/utils/webauthn', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/utils/webauthn')>();
	return {
		...actual,
		registerPasskey: vi.fn(),
		isWebAuthnSupported: vi.fn(() => true)
	};
});

describe('PasskeySetupModal', () => {
	const onsuccess = vi.fn();
	const oncancel = vi.fn();

	async function renderModal(props: Record<string, unknown> = {}) {
		const result = render(PasskeySetupModal, {
			props: { open: true, onsuccess, oncancel, ...props }
		});
		if (screen.queryByRole('dialog')) await waitForDialogFocus();
		return result;
	}

	function createButton() {
		return screen.getByRole('button', { name: 'Create Passkey' });
	}

	beforeEach(() => {
		vi.mocked(isWebAuthnSupported).mockReturnValue(true);
		vi.mocked(apiClient.listPasskeys).mockResolvedValue({ passkeys: [] } as never);
		vi.mocked(apiClient.getPasskeyStatus).mockResolvedValue({
			hasPasskeys: true,
			isUnlocked: true
		} as never);
	});

	afterEach(() => {
		cleanup();
		passkeyStore.reset();
		vi.clearAllMocks();
	});

	it('renders the default title and requires a name', async () => {
		await renderModal();
		expect(screen.getByRole('heading', { name: 'Set Up Passkey Security' })).toBeInTheDocument();
		expect(createButton()).toBeDisabled();
		await userEvent.type(screen.getByLabelText('Passkey Name'), '   ');
		expect(createButton()).toBeDisabled();
	});

	it('renders a custom title and description', async () => {
		await renderModal({ title: 'Add a passkey', description: 'For this laptop' });
		expect(screen.getByRole('heading', { name: 'Add a passkey' })).toBeInTheDocument();
		expect(screen.getByText('For this laptop')).toBeInTheDocument();
	});

	it('creates the passkey on Enter, shows success and then calls onsuccess', async () => {
		vi.mocked(registerPasskey).mockResolvedValue('cred-1');
		await renderModal();
		await userEvent.type(screen.getByLabelText('Passkey Name'), '  Laptop  {Enter}');

		expect(registerPasskey).toHaveBeenCalledWith('Laptop');
		expect(await screen.findByText('Passkey Created Successfully!')).toBeInTheDocument();
		expect(screen.getByText(/protected with "\s*Laptop\s*"/)).toBeInTheDocument();

		await vi.waitFor(() => expect(onsuccess).toHaveBeenCalledTimes(1), { timeout: 3000 });
		expect(onsuccess.mock.calls[0][0].detail).toEqual({ credentialId: 'cred-1' });
		expect(oncancel).toHaveBeenCalledTimes(1);
	});

	it('shows a creating state while the browser ceremony runs', async () => {
		let resolve!: (id: string) => void;
		vi.mocked(registerPasskey).mockReturnValue(new Promise((r) => (resolve = r)));
		await renderModal();
		await userEvent.type(screen.getByLabelText('Passkey Name'), 'Phone');
		await userEvent.click(createButton());
		expect(screen.getByText('Creating your passkey...')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Creating...' })).toBeDisabled();
		resolve('cred-2');
		expect(await screen.findByText('Passkey Created Successfully!')).toBeInTheDocument();
	});

	it('returns to the form with the store error when creation fails', async () => {
		vi.mocked(registerPasskey).mockRejectedValue(new WebAuthnError('nope', 'USER_CANCELLED'));
		await renderModal();
		await userEvent.type(screen.getByLabelText('Passkey Name'), 'Phone');
		await userEvent.click(createButton());
		expect(
			await screen.findByText('Passkey creation was cancelled. Please try again.')
		).toBeInTheDocument();
		expect(createButton()).toBeEnabled();
		expect(onsuccess).not.toHaveBeenCalled();
	});

	it('clears the store error and calls oncancel on Cancel', async () => {
		vi.mocked(registerPasskey).mockRejectedValue(new Error('boom'));
		await renderModal();
		await userEvent.type(screen.getByLabelText('Passkey Name'), 'Phone');
		await userEvent.click(createButton());
		expect(await screen.findByText('boom')).toBeInTheDocument();

		await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(oncancel).toHaveBeenCalledTimes(1);
		expect(passkeyStore.error).toBeNull();
	});
});
