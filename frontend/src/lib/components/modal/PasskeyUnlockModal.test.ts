import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { waitForDialogFocus } from '#lib/test/dialog.ts';
import { apiClient } from '#lib/api/client.ts';
import {
	authenticateWithPasskey,
	isWebAuthnSupported,
	isPlatformAuthenticatorAvailable,
	WebAuthnError
} from '#lib/utils/webauthn.ts';
import { passkeyStore } from '#lib/stores/passkeys.svelte.ts';
import PasskeyUnlockModal from './PasskeyUnlockModal.svelte';

vi.mock('#lib/api/client.ts', () => ({
	apiClient: { unlockWithPasskey: vi.fn(), getPasskeyStatus: vi.fn() }
}));

vi.mock('#lib/utils/webauthn.ts', async (importOriginal) =>
	(await import('#lib/test/webauthn-mock.ts')).mockWebAuthn(importOriginal)
);

describe('PasskeyUnlockModal', () => {
	const onsuccess = vi.fn();
	const oncancel = vi.fn();

	async function renderModal(props: Record<string, unknown> = {}) {
		const result = render(PasskeyUnlockModal, {
			props: { open: true, onsuccess, oncancel, ...props }
		});
		if (screen.queryByRole('dialog')) await waitForDialogFocus();
		return result;
	}

	function unlockButton() {
		return screen.getByRole('button', { name: 'Unlock with Passkey' });
	}

	beforeEach(() => {
		vi.mocked(isWebAuthnSupported).mockReturnValue(true);
		vi.mocked(isPlatformAuthenticatorAvailable).mockResolvedValue(false);
		vi.mocked(apiClient.unlockWithPasskey).mockResolvedValue(undefined as never);
		vi.mocked(apiClient.getPasskeyStatus).mockResolvedValue({ isUnlocked: true } as never);
	});

	afterEach(() => {
		cleanup();
		passkeyStore.reset();
		vi.clearAllMocks();
	});

	it('offers a security key when no platform authenticator exists', async () => {
		await renderModal();
		expect(screen.getByRole('heading', { name: 'Unlock Your Secrets' })).toBeInTheDocument();
		expect(screen.getByText(/security key to authenticate/)).toBeInTheDocument();
		expect(unlockButton()).toBeEnabled();
	});

	it('mentions Touch ID / Windows Hello when a platform authenticator exists', async () => {
		vi.mocked(isPlatformAuthenticatorAvailable).mockResolvedValue(true);
		await renderModal();
		expect(await screen.findByText(/Touch ID, Face ID, or Windows Hello/)).toBeInTheDocument();
	});

	it('warns and disables unlocking when WebAuthn is unsupported', async () => {
		vi.mocked(isWebAuthnSupported).mockReturnValue(false);
		await renderModal({ title: 'Locked', description: 'Unlock it' });
		expect(screen.getByRole('heading', { name: 'Locked' })).toBeInTheDocument();
		expect(screen.getByText(/WebAuthn is not supported in this browser/)).toBeInTheDocument();
		expect(unlockButton()).toBeDisabled();
	});

	it('unlocks with the auth ticket, shows success and calls onsuccess', async () => {
		vi.mocked(authenticateWithPasskey).mockResolvedValue({
			credentialId: 'cred',
			authTicket: 'ticket-1'
		} as never);
		await renderModal();
		await userEvent.click(unlockButton());

		expect(apiClient.unlockWithPasskey).toHaveBeenCalledWith({ authTicket: 'ticket-1' });
		expect(await screen.findByText('Secrets Unlocked!')).toBeInTheDocument();
		await vi.waitFor(() => expect(onsuccess).toHaveBeenCalledTimes(1), { timeout: 3000 });
		expect(oncancel).toHaveBeenCalledTimes(1);
	});

	it('shows the authenticating state while waiting for the browser', async () => {
		let resolve!: (v: unknown) => void;
		vi.mocked(authenticateWithPasskey).mockReturnValue(new Promise((r) => (resolve = r)) as never);
		await renderModal();
		await userEvent.click(unlockButton());
		expect(
			screen.getByText("Please follow your browser's authentication prompt")
		).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Authenticating...' })).toBeDisabled();
		resolve({ credentialId: 'c', authTicket: 't' });
		expect(await screen.findByText('Secrets Unlocked!')).toBeInTheDocument();
	});

	it('goes back to ready with the store error when authentication fails', async () => {
		vi.mocked(authenticateWithPasskey).mockRejectedValue(
			new WebAuthnError('none', 'NO_CREDENTIALS')
		);
		await renderModal();
		await userEvent.click(unlockButton());
		expect(
			await screen.findByText('No matching passkeys found for this device.')
		).toBeInTheDocument();
		expect(unlockButton()).toBeEnabled();
		expect(onsuccess).not.toHaveBeenCalled();
	});

	it('clears the error and calls oncancel on Cancel', async () => {
		vi.mocked(authenticateWithPasskey).mockRejectedValue(new Error('denied'));
		await renderModal();
		await userEvent.click(unlockButton());
		expect(await screen.findByText('denied')).toBeInTheDocument();
		await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(oncancel).toHaveBeenCalledTimes(1);
		expect(passkeyStore.error).toBeNull();
	});
});
