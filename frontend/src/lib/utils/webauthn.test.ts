import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('#lib/api/client.ts', () => ({
	apiClient: {
		beginPasskeyRegistration: vi.fn(),
		finishPasskeyRegistration: vi.fn(),
		beginPasskeyAuthentication: vi.fn(),
		finishPasskeyAuthentication: vi.fn()
	}
}));

import { apiClient } from '#lib/api/client.ts';
import {
	WebAuthnError,
	authenticateWithPasskey,
	isPlatformAuthenticatorAvailable,
	isWebAuthnSupported,
	registerPasskey
} from './webauthn';

const bytes = (...values: number[]) => new Uint8Array(values).buffer;
const toBytes = (buffer: BufferSource) => Array.from(new Uint8Array(buffer as ArrayBuffer));

// base64url of [0xfb, 0xff] is "-_8" (exercises the -/_ mapping and padding)
const CHALLENGE = '-_8';
const USER_ID = 'AQID'; // [1, 2, 3]
const CRED_ID = 'BAU'; // [4, 5]

function fakeCredential(response: Record<string, unknown>, extra: Record<string, unknown> = {}) {
	return {
		id: 'cred-id',
		rawId: bytes(0xfb, 0xff),
		type: 'public-key',
		authenticatorAttachment: 'platform',
		getClientExtensionResults: () => ({ credProps: { rk: true } }),
		response,
		...extra
	} as unknown as PublicKeyCredential;
}

function domError(name: string) {
	return new DOMException('dom message', name);
}

async function rejection(promise: Promise<unknown>): Promise<WebAuthnError> {
	return promise.then(
		() => {
			throw new Error('expected a rejection');
		},
		(error: WebAuthnError) => error
	);
}

describe('webauthn', () => {
	let create: ReturnType<typeof vi.fn>;
	let get: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.clearAllMocks();
		create = vi.fn();
		get = vi.fn();
		vi.spyOn(navigator, 'credentials', 'get').mockReturnValue({
			create,
			get
		} as unknown as CredentialsContainer);
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	describe('support checks', () => {
		it('reports support from navigator.credentials and PublicKeyCredential', () => {
			expect(isWebAuthnSupported()).toBe(true);

			vi.stubGlobal('PublicKeyCredential', undefined);
			expect(isWebAuthnSupported()).toBe(false);
		});

		it('asks the platform authenticator and treats failures as unavailable', async () => {
			const check = vi
				.spyOn(PublicKeyCredential, 'isUserVerifyingPlatformAuthenticatorAvailable')
				.mockResolvedValueOnce(true)
				.mockRejectedValueOnce(new Error('nope'));

			await expect(isPlatformAuthenticatorAvailable()).resolves.toBe(true);
			await expect(isPlatformAuthenticatorAvailable()).resolves.toBe(false);
			expect(check).toHaveBeenCalledTimes(2);

			vi.stubGlobal('PublicKeyCredential', undefined);
			await expect(isPlatformAuthenticatorAvailable()).resolves.toBe(false);
		});
	});

	describe('registerPasskey', () => {
		beforeEach(() => {
			vi.mocked(apiClient.beginPasskeyRegistration).mockResolvedValue({
				sessionId: 'sess-1',
				options: {
					publicKey: {
						challenge: CHALLENGE,
						rp: { name: 'Schist' },
						user: { id: USER_ID, name: 'alice', displayName: 'Alice' },
						pubKeyCredParams: [],
						excludeCredentials: [{ id: CRED_ID, type: 'public-key' }]
					}
				}
			} as never);
			vi.mocked(apiClient.finishPasskeyRegistration).mockResolvedValue({
				credentialId: 'new-cred'
			} as never);
		});

		it('decodes the server options, creates the credential and finishes registration', async () => {
			create.mockResolvedValue(
				fakeCredential({
					clientDataJSON: bytes(1),
					attestationObject: bytes(2, 3),
					getAuthenticatorData: () => bytes(9),
					getTransports: () => ['internal', 'hybrid'],
					getPublicKeyAlgorithm: () => -7,
					getPublicKey: () => bytes(255)
				})
			);

			await expect(registerPasskey('Laptop')).resolves.toBe('new-cred');

			expect(apiClient.beginPasskeyRegistration).toHaveBeenCalledWith({ name: 'Laptop' });
			const { publicKey } = create.mock.calls[0][0];
			expect(toBytes(publicKey.challenge)).toEqual([0xfb, 0xff]);
			expect(toBytes(publicKey.user.id)).toEqual([1, 2, 3]);
			expect(publicKey.user.name).toBe('alice');
			expect(toBytes(publicKey.excludeCredentials[0].id)).toEqual([4, 5]);

			expect(apiClient.finishPasskeyRegistration).toHaveBeenCalledWith({
				name: 'Laptop',
				sessionId: 'sess-1',
				response: {
					id: 'cred-id',
					rawId: '-_8',
					response: {
						clientDataJSON: 'AQ',
						attestationObject: 'AgM',
						authenticatorData: 'CQ',
						transports: ['internal', 'hybrid'],
						publicKeyAlgorithm: -7,
						publicKey: '_w'
					},
					authenticatorAttachment: 'platform',
					clientExtensionResults: { credProps: { rk: true } },
					type: 'public-key'
				}
			});
		});

		it('omits optional attestation fields the browser does not provide', async () => {
			create.mockResolvedValue(
				fakeCredential(
					{ clientDataJSON: bytes(1), attestationObject: bytes(2), getPublicKey: () => null },
					{ authenticatorAttachment: null }
				)
			);

			await registerPasskey('Key');

			const { response } = vi.mocked(apiClient.finishPasskeyRegistration).mock.calls[0][0];
			expect(response.response.authenticatorData).toBeUndefined();
			expect(response.response.transports).toBeUndefined();
			expect(response.response.publicKeyAlgorithm).toBeUndefined();
			expect(response.response.publicKey).toBeUndefined();
			expect(response.authenticatorAttachment).toBeUndefined();
		});

		it('fails when the browser returns no credential', async () => {
			create.mockResolvedValue(null);

			const error = await rejection(registerPasskey('Key'));

			expect(error).toBeInstanceOf(WebAuthnError);
			expect(error.code).toBe('CREATION_FAILED');
			expect(apiClient.finishPasskeyRegistration).not.toHaveBeenCalled();
		});

		it.each([
			['NotAllowedError', 'USER_CANCELLED'],
			['InvalidStateError', 'CREDENTIAL_EXISTS'],
			['NotSupportedError', 'NOT_SUPPORTED'],
			['SecurityError', 'SECURITY_ERROR'],
			['AbortError', 'WEBAUTHN_ERROR']
		])('maps a %s from the browser to %s', async (name, code) => {
			create.mockRejectedValue(domError(name));

			const error = await rejection(registerPasskey('Key'));

			expect(error.name).toBe('WebAuthnError');
			expect(error.code).toBe(code);
		});

		it('reports API and decoding failures as UNKNOWN_ERROR', async () => {
			vi.mocked(apiClient.beginPasskeyRegistration).mockRejectedValueOnce(
				new Error(JSON.stringify({ error: 'nope', code: 'FORBIDDEN' }))
			);
			expect((await rejection(registerPasskey('Key'))).code).toBe('UNKNOWN_ERROR');

			vi.mocked(apiClient.beginPasskeyRegistration).mockResolvedValueOnce({
				sessionId: 's',
				options: { publicKey: { challenge: '***', user: { id: USER_ID } } }
			} as never);
			// atob() throws a DOMException for invalid base64, surfaced as a WebAuthn error.
			expect((await rejection(registerPasskey('Key'))).code).toBe('WEBAUTHN_ERROR');
			expect(create).not.toHaveBeenCalled();
		});

		it('refuses to start when WebAuthn is unavailable', async () => {
			vi.stubGlobal('PublicKeyCredential', undefined);

			const error = await rejection(registerPasskey('Key'));

			expect(error.code).toBe('NOT_SUPPORTED');
			expect(apiClient.beginPasskeyRegistration).not.toHaveBeenCalled();
		});
	});

	describe('authenticateWithPasskey', () => {
		beforeEach(() => {
			vi.mocked(apiClient.beginPasskeyAuthentication).mockResolvedValue({
				sessionId: 'sess-2',
				options: {
					publicKey: {
						challenge: CHALLENGE,
						allowCredentials: [{ id: CRED_ID, type: 'public-key' }]
					}
				}
			} as never);
			vi.mocked(apiClient.finishPasskeyAuthentication).mockResolvedValue({
				credentialId: 'cred-id',
				authTicket: 'ticket-1'
			} as never);
		});

		it('gets an assertion and returns the server-minted auth ticket', async () => {
			get.mockResolvedValue(
				fakeCredential({
					clientDataJSON: bytes(1),
					authenticatorData: bytes(2),
					signature: bytes(3),
					userHandle: bytes(4)
				})
			);

			await expect(authenticateWithPasskey()).resolves.toEqual({
				credentialId: 'cred-id',
				authTicket: 'ticket-1'
			});

			const { publicKey } = get.mock.calls[0][0];
			expect(toBytes(publicKey.challenge)).toEqual([0xfb, 0xff]);
			expect(toBytes(publicKey.allowCredentials[0].id)).toEqual([4, 5]);
			expect(apiClient.finishPasskeyAuthentication).toHaveBeenCalledWith({
				sessionId: 'sess-2',
				response: {
					id: 'cred-id',
					rawId: '-_8',
					response: {
						clientDataJSON: 'AQ',
						authenticatorData: 'Ag',
						signature: 'Aw',
						userHandle: 'BA'
					},
					authenticatorAttachment: 'platform',
					clientExtensionResults: { credProps: { rk: true } },
					type: 'public-key'
				}
			});
		});

		it('leaves out a missing user handle', async () => {
			get.mockResolvedValue(
				fakeCredential({
					clientDataJSON: bytes(1),
					authenticatorData: bytes(2),
					signature: bytes(3),
					userHandle: null
				})
			);

			await authenticateWithPasskey();

			const { response } = vi.mocked(apiClient.finishPasskeyAuthentication).mock.calls[0][0];
			expect(response.response.userHandle).toBeUndefined();
		});

		it('fails when the browser returns no credential', async () => {
			get.mockResolvedValue(null);

			expect((await rejection(authenticateWithPasskey())).code).toBe('AUTHENTICATION_FAILED');
		});

		it.each([
			['NotAllowedError', 'USER_CANCELLED'],
			['InvalidStateError', 'NO_CREDENTIALS'],
			['NotSupportedError', 'NOT_SUPPORTED'],
			['SecurityError', 'SECURITY_ERROR'],
			['UnknownError', 'WEBAUTHN_ERROR']
		])('maps a %s from the browser to %s', async (name, code) => {
			get.mockRejectedValue(domError(name));

			expect((await rejection(authenticateWithPasskey())).code).toBe(code);
		});

		it('reports a failed finish call as UNKNOWN_ERROR', async () => {
			get.mockResolvedValue(
				fakeCredential({
					clientDataJSON: bytes(1),
					authenticatorData: bytes(2),
					signature: bytes(3)
				})
			);
			vi.mocked(apiClient.finishPasskeyAuthentication).mockRejectedValue(new Error('500'));

			expect((await rejection(authenticateWithPasskey())).code).toBe('UNKNOWN_ERROR');
		});

		it('refuses to start when WebAuthn is unavailable', async () => {
			vi.stubGlobal('PublicKeyCredential', undefined);

			expect((await rejection(authenticateWithPasskey())).code).toBe('NOT_SUPPORTED');
		});
	});
});
