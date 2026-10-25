import { vi } from 'vitest';
import type * as WebAuthn from '$lib/utils/webauthn';

/**
 * vi.mock factory for $lib/utils/webauthn in component tests. The browser
 * ceremonies become mocks and the browser reports WebAuthn support without a
 * platform authenticator; everything else (WebAuthnError, helpers) is real:
 *
 *   vi.mock('$lib/utils/webauthn', async (importOriginal) =>
 *     (await import('$lib/test/webauthn-mock')).mockWebAuthn(importOriginal)
 *   );
 */
export async function mockWebAuthn(importOriginal: <T>() => Promise<T>) {
	const actual = await importOriginal<typeof WebAuthn>();
	return {
		...actual,
		registerPasskey: vi.fn(),
		authenticateWithPasskey: vi.fn(),
		isWebAuthnSupported: vi.fn(() => true),
		isPlatformAuthenticatorAvailable: vi.fn(async () => false)
	};
}
