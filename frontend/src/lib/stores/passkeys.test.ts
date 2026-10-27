import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('#lib/api/client.ts', () => ({
	apiClient: {
		getPasskeyStatus: vi.fn(),
		listPasskeys: vi.fn(),
		deletePasskey: vi.fn(),
		unlockWithPasskey: vi.fn()
	}
}));

vi.mock('#lib/utils/webauthn.ts', async (importOriginal) => {
	const actual = await importOriginal<typeof import('#lib/utils/webauthn.ts')>();
	return {
		WebAuthnError: actual.WebAuthnError,
		registerPasskey: vi.fn(),
		authenticateWithPasskey: vi.fn(),
		isWebAuthnSupported: vi.fn()
	};
});

import { apiClient } from '#lib/api/client.ts';
import {
	WebAuthnError,
	authenticateWithPasskey,
	isWebAuthnSupported,
	registerPasskey
} from '#lib/utils/webauthn.ts';
import { passkeyStore } from './passkeys.svelte';

const api = vi.mocked(apiClient);
const unlocked = { hasPasskeys: true, isUnlocked: true } as never;
const passkeys = [{ id: 'k1', name: 'Laptop' }] as never;

describe('passkey store', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		passkeyStore.reset();
		vi.mocked(isWebAuthnSupported).mockReturnValue(true);
		api.getPasskeyStatus.mockResolvedValue(unlocked);
		api.listPasskeys.mockResolvedValue({ passkeys } as never);
	});

	it('derives setup and unlock flags from the status', async () => {
		expect(passkeyStore.requiresSetup).toBe(true);
		expect(passkeyStore.isUnlocked).toBe(false);

		await passkeyStore.loadStatus(true);

		expect(api.getPasskeyStatus).toHaveBeenCalledWith(true);
		expect(passkeyStore.status).toEqual(unlocked);
		expect(passkeyStore.isUnlocked).toBe(true);
		expect(passkeyStore.hasPasskeys).toBe(true);
		expect(passkeyStore.requiresSetup).toBe(false);
	});

	it('loads the passkey list and records API errors', async () => {
		await expect(passkeyStore.loadPasskeys()).resolves.toEqual(passkeys);
		expect(passkeyStore.passkeys).toEqual(passkeys);

		api.listPasskeys.mockRejectedValueOnce(
			new Error(JSON.stringify({ error: 'Locked', code: 'FORBIDDEN' }))
		);
		await expect(passkeyStore.loadPasskeys()).rejects.toThrow();
		expect(passkeyStore.error).toBe('Locked');
		expect(passkeyStore.loading).toBe(false);

		passkeyStore.clearError();
		expect(passkeyStore.error).toBeNull();
	});

	it('deletes a passkey and reloads list and status', async () => {
		api.deletePasskey.mockResolvedValueOnce({ message: 'ok' });

		await passkeyStore.deletePasskey('k1');

		expect(api.deletePasskey).toHaveBeenCalledWith('k1');
		expect(api.listPasskeys).toHaveBeenCalled();
		expect(api.getPasskeyStatus).toHaveBeenCalled();
	});

	describe('createPasskey', () => {
		it('registers, then reloads list and status', async () => {
			vi.mocked(registerPasskey).mockResolvedValueOnce('cred-1');

			await expect(passkeyStore.createPasskey('Laptop')).resolves.toBe('cred-1');

			expect(registerPasskey).toHaveBeenCalledWith('Laptop');
			expect(passkeyStore.passkeys).toEqual(passkeys);
			expect(passkeyStore.status).toEqual(unlocked);
			expect(passkeyStore.loading).toBe(false);
		});

		it('refuses when WebAuthn is unsupported', async () => {
			vi.mocked(isWebAuthnSupported).mockReturnValue(false);

			await expect(passkeyStore.createPasskey('x')).rejects.toMatchObject({
				code: 'NOT_SUPPORTED'
			});
			expect(passkeyStore.error).toContain('not supported in this browser');
			expect(registerPasskey).not.toHaveBeenCalled();
		});

		it.each([
			['USER_CANCELLED', 'Passkey creation was cancelled. Please try again.'],
			[
				'CREDENTIAL_EXISTS',
				'A passkey already exists for this device. Try using a different name.'
			],
			['NOT_SUPPORTED', 'WebAuthn is not supported on this device.'],
			['SECURITY_ERROR', "Security error occurred. Please ensure you're on a secure connection."],
			['UNKNOWN_ERROR', 'Something odd']
		])('explains a %s failure', async (code, message) => {
			vi.mocked(registerPasskey).mockRejectedValueOnce(new WebAuthnError('Something odd', code));

			await expect(passkeyStore.createPasskey('x')).rejects.toBeInstanceOf(WebAuthnError);
			expect(passkeyStore.error).toBe(message);
			expect(passkeyStore.loading).toBe(false);
		});

		it('falls back to the error message, or a default', async () => {
			vi.mocked(registerPasskey).mockRejectedValueOnce(new Error('boom'));
			await expect(passkeyStore.createPasskey('x')).rejects.toThrow();
			expect(passkeyStore.error).toBe('boom');

			// Registered, but reloading the list afterwards failed with an API error.
			vi.mocked(registerPasskey).mockResolvedValueOnce('cred-2');
			api.listPasskeys.mockRejectedValueOnce(
				new Error(JSON.stringify({ error: 'Secrets are locked', code: 'FORBIDDEN' }))
			);
			await expect(passkeyStore.createPasskey('x')).rejects.toThrow();
			expect(passkeyStore.error).toBe('Secrets are locked');

			vi.mocked(registerPasskey).mockRejectedValueOnce('weird');
			await expect(passkeyStore.createPasskey('x')).rejects.toBe('weird');
			expect(passkeyStore.error).toBe('Failed to create passkey');
		});
	});

	describe('authenticateWithPasskey', () => {
		it('unlocks secrets with the auth ticket and reloads status', async () => {
			vi.mocked(authenticateWithPasskey).mockResolvedValueOnce({
				credentialId: 'cred-1',
				authTicket: 'ticket-1'
			});

			await expect(passkeyStore.authenticateWithPasskey()).resolves.toBe('cred-1');

			expect(api.unlockWithPasskey).toHaveBeenCalledWith({ authTicket: 'ticket-1' });
			expect(passkeyStore.isUnlocked).toBe(true);
			expect(passkeyStore.loading).toBe(false);
		});

		it('refuses when WebAuthn is unsupported', async () => {
			vi.mocked(isWebAuthnSupported).mockReturnValue(false);

			await expect(passkeyStore.authenticateWithPasskey()).rejects.toMatchObject({
				code: 'NOT_SUPPORTED'
			});
			expect(authenticateWithPasskey).not.toHaveBeenCalled();
		});

		it.each([
			['USER_CANCELLED', 'Authentication was cancelled. Please try again.'],
			['NO_CREDENTIALS', 'No matching passkeys found for this device.'],
			['NOT_SUPPORTED', 'WebAuthn is not supported on this device.'],
			['SECURITY_ERROR', 'Security error occurred during authentication.'],
			['WEBAUTHN_ERROR', 'Something odd']
		])('explains a %s failure', async (code, message) => {
			vi.mocked(authenticateWithPasskey).mockRejectedValueOnce(
				new WebAuthnError('Something odd', code)
			);

			await expect(passkeyStore.authenticateWithPasskey()).rejects.toThrow();
			expect(passkeyStore.error).toBe(message);
		});

		it('reports a failed unlock, or a default for non-errors', async () => {
			vi.mocked(authenticateWithPasskey).mockResolvedValue({ credentialId: 'c', authTicket: 't' });
			api.unlockWithPasskey.mockRejectedValueOnce(new Error('ticket expired'));
			await expect(passkeyStore.authenticateWithPasskey()).rejects.toThrow();
			expect(passkeyStore.error).toBe('ticket expired');

			api.unlockWithPasskey.mockRejectedValueOnce(
				new Error(JSON.stringify({ error: 'Auth ticket expired', code: 'UNAUTHORIZED' }))
			);
			await expect(passkeyStore.authenticateWithPasskey()).rejects.toThrow();
			expect(passkeyStore.error).toBe('Auth ticket expired');

			api.unlockWithPasskey.mockRejectedValueOnce(42);
			await expect(passkeyStore.authenticateWithPasskey()).rejects.toBe(42);
			expect(passkeyStore.error).toBe('Failed to authenticate with passkey');
		});
	});
});
