import { apiClient } from '$lib/api/client';
import type {
	WebAuthnFinishRegistrationRequest,
	WebAuthnFinishAuthenticationRequest,
	RegistrationResponseJSON,
	AuthenticationResponseJSON
} from '$lib/api/types';

/**
 * WebAuthn utility functions for handling passkey registration and authentication
 */

export class WebAuthnError extends Error {
	constructor(
		message: string,
		public code?: string
	) {
		super(message);
		this.name = 'WebAuthnError';
	}
}

/**
 * Convert ArrayBuffer to base64url string
 */
function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = '';
	for (let i = 0; i < bytes.byteLength; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Convert base64url string to ArrayBuffer
 */
function base64UrlToArrayBuffer(base64url: string): ArrayBuffer {
	// Add padding if needed
	const padding = '='.repeat((4 - (base64url.length % 4)) % 4);
	const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/') + padding;

	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes.buffer;
}

/**
 * Convert WebAuthn registration response to JSON format
 */
function credentialCreationResponseToJSON(
	credential: PublicKeyCredential
): RegistrationResponseJSON {
	const response = credential.response as AuthenticatorAttestationResponse;

	return {
		id: credential.id,
		rawId: arrayBufferToBase64Url(credential.rawId),
		response: {
			clientDataJSON: arrayBufferToBase64Url(response.clientDataJSON),
			attestationObject: arrayBufferToBase64Url(response.attestationObject),
			authenticatorData: response.getAuthenticatorData
				? arrayBufferToBase64Url(response.getAuthenticatorData())
				: undefined,
			transports: response.getTransports
				? (response.getTransports() as AuthenticatorTransport[])
				: undefined,
			publicKeyAlgorithm: response.getPublicKeyAlgorithm
				? response.getPublicKeyAlgorithm()
				: undefined,
			publicKey: response.getPublicKey
				? response.getPublicKey()
					? arrayBufferToBase64Url(response.getPublicKey()!)
					: undefined
				: undefined
		},
		authenticatorAttachment:
			(credential.authenticatorAttachment as AuthenticatorAttachment) || undefined,
		clientExtensionResults: credential.getClientExtensionResults(),
		type: credential.type as PublicKeyCredentialType
	};
}

/**
 * Convert WebAuthn authentication response to JSON format
 */
function credentialRequestResponseToJSON(
	credential: PublicKeyCredential
): AuthenticationResponseJSON {
	const response = credential.response as AuthenticatorAssertionResponse;

	return {
		id: credential.id,
		rawId: arrayBufferToBase64Url(credential.rawId),
		response: {
			clientDataJSON: arrayBufferToBase64Url(response.clientDataJSON),
			authenticatorData: arrayBufferToBase64Url(response.authenticatorData),
			signature: arrayBufferToBase64Url(response.signature),
			userHandle: response.userHandle ? arrayBufferToBase64Url(response.userHandle) : undefined
		},
		authenticatorAttachment:
			(credential.authenticatorAttachment as AuthenticatorAttachment) || undefined,
		clientExtensionResults: credential.getClientExtensionResults(),
		type: credential.type as PublicKeyCredentialType
	};
}

/**
 * Convert server's PublicKeyCredentialCreationOptions to format expected by browser
 */
function prepareCreationOptions(
	options: PublicKeyCredentialCreationOptions
): PublicKeyCredentialCreationOptions {
	console.log('Original options:', options);
	console.log('Challenge type:', typeof options.challenge, options.challenge);
	console.log('User ID type:', typeof options.user.id, options.user.id);
	
	try {
		const challengeBuffer = base64UrlToArrayBuffer(options.challenge as unknown as string);
		console.log('Converted challenge:', challengeBuffer);
		
		const userIdBuffer = base64UrlToArrayBuffer(options.user.id as unknown as string);
		console.log('Converted user ID:', userIdBuffer);
		
		return {
			...options,
			challenge: challengeBuffer,
			user: {
				...options.user,
				id: userIdBuffer
			},
			excludeCredentials: options.excludeCredentials?.map((cred) => ({
				...cred,
				id: base64UrlToArrayBuffer(cred.id as unknown as string)
			}))
		};
	} catch (error) {
		console.error('Error in prepareCreationOptions:', error);
		throw error;
	}
}

/**
 * Convert server's PublicKeyCredentialRequestOptions to format expected by browser
 */
function prepareRequestOptions(
	options: PublicKeyCredentialRequestOptions
): PublicKeyCredentialRequestOptions {
	return {
		...options,
		challenge: base64UrlToArrayBuffer(options.challenge as unknown as string),
		allowCredentials: options.allowCredentials?.map((cred) => ({
			...cred,
			id: base64UrlToArrayBuffer(cred.id as unknown as string)
		}))
	};
}

/**
 * Register a new passkey using WebAuthn
 */
export async function registerPasskey(name: string): Promise<string> {
	if (!navigator.credentials || !window.PublicKeyCredential) {
		throw new WebAuthnError('WebAuthn is not supported in this browser', 'NOT_SUPPORTED');
	}

	try {
		// Step 1: Begin registration
		console.log('Beginning passkey registration for:', name);
		const beginResponse = await apiClient.beginPasskeyRegistration({ name });
		console.log('Begin response:', beginResponse);
		
		// The Go WebAuthn library returns options with publicKey nested
		const creationOptions = prepareCreationOptions(beginResponse.options.publicKey);
		console.log('Prepared creation options:', creationOptions);

		// Step 2: Create credential using browser API
		console.log('Calling navigator.credentials.create...');
		const credential = (await navigator.credentials.create({
			publicKey: creationOptions
		})) as PublicKeyCredential;
		console.log('Created credential:', credential);

		if (!credential) {
			throw new WebAuthnError('Failed to create credential', 'CREATION_FAILED');
		}

		// Step 3: Convert to JSON and finish registration
		const credentialJSON = credentialCreationResponseToJSON(credential);
		const finishRequest: WebAuthnFinishRegistrationRequest = {
			name,
			sessionId: beginResponse.sessionId,
			response: credentialJSON
		};

		const finishResponse = await apiClient.finishPasskeyRegistration(finishRequest);
		return finishResponse.credentialId;
	} catch (error) {
		if (error instanceof DOMException) {
			switch (error.name) {
				case 'NotAllowedError':
					throw new WebAuthnError(
						'User cancelled the operation or the operation timed out',
						'USER_CANCELLED'
					);
				case 'InvalidStateError':
					throw new WebAuthnError(
						'A credential already exists for this device',
						'CREDENTIAL_EXISTS'
					);
				case 'NotSupportedError':
					throw new WebAuthnError('WebAuthn is not supported on this device', 'NOT_SUPPORTED');
				case 'SecurityError':
					throw new WebAuthnError(
						'Security error occurred during passkey creation',
						'SECURITY_ERROR'
					);
				default:
					throw new WebAuthnError(`WebAuthn error: ${error.message}`, 'WEBAUTHN_ERROR');
			}
		}

		if (error instanceof WebAuthnError) {
			throw error;
		}

		throw new WebAuthnError('Unexpected error during passkey registration', 'UNKNOWN_ERROR');
	}
}

/**
 * Authenticate using a registered passkey
 */
export async function authenticateWithPasskey(): Promise<string> {
	if (!navigator.credentials || !window.PublicKeyCredential) {
		throw new WebAuthnError('WebAuthn is not supported in this browser', 'NOT_SUPPORTED');
	}

	try {
		// Step 1: Begin authentication
		console.log('Beginning authentication...');
		const beginResponse = await apiClient.beginPasskeyAuthentication();
		console.log('Authentication begin response:', beginResponse);
		// The Go WebAuthn library returns options with publicKey nested  
		const requestOptions = prepareRequestOptions(beginResponse.options.publicKey as any);
		console.log('Prepared request options:', requestOptions);

		// Step 2: Get assertion using browser API
		const credential = (await navigator.credentials.get({
			publicKey: requestOptions
		})) as PublicKeyCredential;

		if (!credential) {
			throw new WebAuthnError('Failed to get credential', 'AUTHENTICATION_FAILED');
		}

		// Step 3: Convert to JSON and finish authentication
		const credentialJSON = credentialRequestResponseToJSON(credential);
		const finishRequest: WebAuthnFinishAuthenticationRequest = {
			sessionId: beginResponse.sessionId,
			response: credentialJSON
		};

		const finishResponse = await apiClient.finishPasskeyAuthentication(finishRequest);
		return finishResponse.credentialId;
	} catch (error) {
		if (error instanceof DOMException) {
			switch (error.name) {
				case 'NotAllowedError':
					throw new WebAuthnError(
						'User cancelled the operation or the operation timed out',
						'USER_CANCELLED'
					);
				case 'InvalidStateError':
					throw new WebAuthnError(
						'No matching credentials found for this device',
						'NO_CREDENTIALS'
					);
				case 'NotSupportedError':
					throw new WebAuthnError('WebAuthn is not supported on this device', 'NOT_SUPPORTED');
				case 'SecurityError':
					throw new WebAuthnError(
						'Security error occurred during authentication',
						'SECURITY_ERROR'
					);
				default:
					throw new WebAuthnError(`WebAuthn error: ${error.message}`, 'WEBAUTHN_ERROR');
			}
		}

		if (error instanceof WebAuthnError) {
			throw error;
		}

		throw new WebAuthnError('Unexpected error during passkey authentication', 'UNKNOWN_ERROR');
	}
}

/**
 * Check if WebAuthn is supported in the current browser
 */
export function isWebAuthnSupported(): boolean {
	return !!(navigator.credentials && window.PublicKeyCredential);
}

/**
 * Check if platform authenticator (like Touch ID, Windows Hello) is available
 */
export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
	if (!isWebAuthnSupported()) {
		return false;
	}

	try {
		return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
	} catch {
		return false;
	}
}
