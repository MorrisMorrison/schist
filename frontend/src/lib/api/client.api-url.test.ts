import { describe, it, expect, vi, beforeEach } from 'vitest';

// $app/env/public exports are bound when the client module loads, and
// browser-mode tests can't reload a module, so the "PUBLIC_API_URL set" case
// needs its own file (client.test.ts covers the unset default).
vi.mock('$app/env/public', () => ({ PUBLIC_API_URL: 'https://wiki.example/api' }));
vi.mock('#lib/stores/auth.svelte.ts', () => ({ authActions: { clearAuth: vi.fn() } }));
vi.mock('#lib/auth/auth-service.ts', () => ({
	authService: { handleSessionExpired: vi.fn().mockResolvedValue(undefined) }
}));

import { SchistApiClient } from './client';

describe('SchistApiClient with PUBLIC_API_URL', () => {
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		localStorage.clear();
		fetchMock = vi.fn(
			async () =>
				new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
		);
		vi.stubGlobal('fetch', fetchMock);
	});

	it('uses PUBLIC_API_URL when set', async () => {
		const remote = new SchistApiClient();

		await remote.getCurrentUser();

		expect(fetchMock.mock.calls.at(-1)![0]).toBe('https://wiki.example/api/auth/me');
		expect(remote.getAssetUrl('/assets/a.png')).toBe('https://wiki.example/uploads/a.png');
	});
});
