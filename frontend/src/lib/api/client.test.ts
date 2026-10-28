import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { requestDeduplicator } from '#lib/utils/request-deduplication.ts';

// PUBLIC_API_URL unset; the "set" case is in client.api-url.test.ts.
vi.mock('$app/env/public', () => ({ PUBLIC_API_URL: undefined }));

vi.mock('#lib/stores/auth.svelte.ts', () => ({ authActions: { clearAuth: vi.fn() } }));
vi.mock('#lib/auth/auth-service.ts', () => ({
	authService: { handleSessionExpired: vi.fn().mockResolvedValue(undefined) }
}));

import { SchistApiClient } from './client';
import { authActions } from '#lib/stores/auth.svelte.ts';
import { authService } from '#lib/auth/auth-service.ts';

const TOKEN_KEY = 'schist_auth_token';

function json(body: unknown, init: ResponseInit = {}): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { 'Content-Type': 'application/json' },
		...init
	});
}

let fetchMock: ReturnType<typeof vi.fn>;

function lastCall(): { url: string; init: RequestInit; headers: Record<string, string> } {
	const [url, init = {}] = fetchMock.mock.calls.at(-1)!;
	return { url, init, headers: (init.headers ?? {}) as Record<string, string> };
}

/** Starts a call, flushes the client's retry/backoff timers and returns its settled outcome. */
async function settle<T>(promise: Promise<T>): Promise<{ value?: T; error?: Error }> {
	const outcome = promise.then(
		(value) => ({ value }),
		(error: Error) => ({ error })
	);
	let done = false;
	void outcome.finally(() => (done = true));
	while (!done) await vi.advanceTimersByTimeAsync(100);
	return outcome;
}

function envelope(error: Error | undefined) {
	return JSON.parse(error!.message);
}

describe('SchistApiClient', () => {
	let client: SchistApiClient;

	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['setTimeout'] });
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(console, 'debug').mockImplementation(() => {});
		localStorage.clear();
		requestDeduplicator.clearAll();
		fetchMock = vi.fn(async () => json({}));
		vi.stubGlobal('fetch', fetchMock);
		client = new SchistApiClient();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
		vi.clearAllMocks();
		localStorage.clear();
	});

	describe('request basics', () => {
		it('uses the relative /api base with JSON headers and no token', async () => {
			fetchMock.mockResolvedValue(json({ auth_enabled: false }));

			await expect(client.getConfig()).resolves.toEqual({ auth_enabled: false });

			const { url, headers } = lastCall();
			expect(url).toBe('/api/config');
			expect(headers['Content-Type']).toBe('application/json');
			expect(headers.Accept).toBe('application/json');
			expect(headers.Authorization).toBeUndefined();
		});

		it('caches the app config after the first fetch', async () => {
			fetchMock.mockResolvedValue(json({ auth_enabled: true }));

			await client.getConfig();
			await client.getConfig();

			expect(fetchMock).toHaveBeenCalledTimes(1);
		});

		it('sends the Bearer token set on the client', async () => {
			client.setAuthToken('abc');

			await client.getCurrentUser();

			expect(lastCall().headers.Authorization).toBe('Bearer abc');
		});

		it('falls back to the token in localStorage before setAuthToken is called', async () => {
			localStorage.setItem(TOKEN_KEY, 'stored');

			await client.getCurrentUser();

			expect(lastCall().headers.Authorization).toBe('Bearer stored');
		});

		it('returns an empty object for 204 and empty bodies', async () => {
			fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
			await expect(client.deleteDocumentByPath('a')).resolves.toBeUndefined();

			fetchMock.mockResolvedValueOnce(new Response('', { headers: { 'content-length': '0' } }));
			await expect(client.lockSecrets()).resolves.toEqual({});
		});

		it('drops the JSON content type for FormData bodies', async () => {
			const files = [new File(['# a'], 'a.md')] as unknown as FileList;
			fetchMock.mockResolvedValue(json({ imported: 1 }));

			await client.importDocuments(files, { target_path: '/in', overwrite_mode: 'skip' });

			const { url, init, headers } = lastCall();
			expect(url).toBe('/api/import/documents');
			expect(init.method).toBe('POST');
			expect(headers['Content-Type']).toBeUndefined();
			const body = init.body as FormData;
			expect(body.getAll('files')).toHaveLength(1);
			expect(body.get('target_path')).toBe('/in');
			expect(body.get('overwrite_mode')).toBe('skip');
		});

		it('deduplicates concurrent GETs unless forced', async () => {
			let resolve!: (r: Response) => void;
			fetchMock.mockImplementation(() => new Promise<Response>((r) => (resolve = r)));

			const a = client.getDocuments();
			const b = client.getDocuments();
			await Promise.resolve();
			expect(fetchMock).toHaveBeenCalledTimes(1);
			resolve(json({ documents: [{ id: 1 }] }));

			await expect(a).resolves.toEqual([{ id: 1 }]);
			await expect(b).resolves.toEqual([{ id: 1 }]);

			fetchMock.mockImplementation(async () => json({ documents: [] }));
			const c = client.getDocuments(true);
			const d = client.getDocuments(true);
			await Promise.all([c, d]);
			expect(fetchMock).toHaveBeenCalledTimes(3);
		});
	});

	describe('error envelope', () => {
		it('rethrows the backend {error, code, details} envelope unchanged', async () => {
			const body = {
				error: 'Document not found',
				code: 'RESOURCE_NOT_FOUND',
				details: { path: '/a' }
			};
			fetchMock.mockResolvedValue(json(body, { status: 404 }));

			const { error } = await settle(client.getDocumentByPath('a'));

			expect(envelope(error)).toEqual(body);
			expect(fetchMock).toHaveBeenCalledTimes(1);
		});

		it('builds an envelope from the status when the body is not JSON', async () => {
			fetchMock.mockResolvedValue(new Response('upstream down', { status: 503 }));

			const { error } = await settle(client.getAllTags());

			expect(envelope(error)).toEqual({ error: 'upstream down', code: 'SERVICE_UNAVAILABLE' });
		});

		it('falls back to the status text, then HTTP <status>, for empty bodies', async () => {
			fetchMock.mockResolvedValueOnce(new Response('', { status: 409, statusText: 'Conflict' }));
			expect(envelope((await settle(client.createFolder('x'))).error)).toEqual({
				error: 'Conflict',
				code: 'RESOURCE_CONFLICT'
			});

			fetchMock.mockResolvedValueOnce(new Response('', { status: 418 }));
			expect(envelope((await settle(client.createFolder('x'))).error)).toEqual({
				error: 'HTTP 418 Error',
				code: undefined
			});
		});

		it('propagates network failures', async () => {
			fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

			const { error } = await settle(client.getCurrentUser());

			expect(error).toBeInstanceOf(TypeError);
		});
	});

	describe('401 handling', () => {
		beforeEach(() => {
			client.setAuthToken('tok');
		});

		it('recovers when a retry succeeds and keeps the session', async () => {
			fetchMock
				.mockResolvedValueOnce(json({ error: 'x', code: 'UNAUTHORIZED' }, { status: 401 }))
				.mockResolvedValueOnce(json({ username: 'alice' }));

			const { value } = await settle(client.getCurrentUser());

			expect(value).toEqual({ username: 'alice' });
			expect(fetchMock).toHaveBeenCalledTimes(2);
			expect(authActions.clearAuth).not.toHaveBeenCalled();
		});

		it('logs out and redirects after a 401 the session check confirms', async () => {
			window.history.replaceState(null, '', '/documents/a?x=1');
			const unauthorized = () => json({ error: 'expired', code: 'UNAUTHORIZED' }, { status: 401 });
			fetchMock.mockImplementation(async () => unauthorized());

			const { error } = await settle(client.getDocuments());

			// 1 request + 2 retries + 1 /auth/me revalidation
			expect(fetchMock).toHaveBeenCalledTimes(4);
			const [meUrl, meInit] = fetchMock.mock.calls[3];
			expect(meUrl).toBe('/api/auth/me');
			expect(meInit.headers.Authorization).toBe('Bearer tok');
			expect(authActions.clearAuth).toHaveBeenCalledTimes(1);
			expect(authService.handleSessionExpired).toHaveBeenCalledWith('/documents/a?x=1');
			expect(envelope(error).code).toBe('UNAUTHORIZED');
			window.history.replaceState(null, '', '/');
		});

		it('keeps the session when /auth/me still accepts the token', async () => {
			fetchMock.mockImplementation(async (url: string) =>
				url === '/api/auth/me' ? json({ username: 'alice' }) : json({}, { status: 401 })
			);

			const { error } = await settle(client.getAllTags());

			expect(error).toBeDefined();
			expect(authActions.clearAuth).not.toHaveBeenCalled();
		});

		it('keeps the session when the check is inconclusive (5xx / network)', async () => {
			let meCalls = 0;
			fetchMock.mockImplementation(async (url: string) => {
				if (url !== '/api/auth/me') return json({}, { status: 401 });
				meCalls++;
				if (meCalls === 1) throw new TypeError('offline');
				return json({}, { status: 503 });
			});

			await settle(client.getAllTags());

			expect(meCalls).toBe(2);
			expect(authActions.clearAuth).not.toHaveBeenCalled();
		});

		it('logs out without checking when there is no token', async () => {
			client.setAuthToken(null);
			fetchMock.mockResolvedValue(json({}, { status: 401 }));

			await settle(client.getAllTags());

			expect(fetchMock).toHaveBeenCalledTimes(3);
			expect(authActions.clearAuth).toHaveBeenCalled();
		});

		it('shares one session check across a burst of 401s', async () => {
			// A slow /auth/me so both requests' 401 handlers overlap.
			fetchMock.mockImplementation((url: string) =>
				url === '/api/auth/me'
					? new Promise((r) => setTimeout(() => r(json({}, { status: 401 })), 1000))
					: Promise.resolve(json({}, { status: 401 }))
			);

			await settle(Promise.allSettled([client.getAllTags(), client.listUsers()]));

			const meCalls = fetchMock.mock.calls.filter(([u]) => u === '/api/auth/me');
			expect(meCalls).toHaveLength(1);
		});
	});

	describe('auth endpoints', () => {
		it('stores the token after a passkey login and clears it on logout', async () => {
			fetchMock.mockResolvedValueOnce(json({ token: 'new-token', user: { username: 'a' } }));

			await client.loginWithPasskey('ticket-1');

			expect(lastCall().url).toBe('/api/auth/login/passkey');
			expect(lastCall().init.method).toBe('POST');
			expect(JSON.parse(lastCall().init.body as string)).toEqual({ authTicket: 'ticket-1' });

			fetchMock.mockResolvedValueOnce(json({ message: 'ok' }));
			await client.getCurrentUser();
			expect(lastCall().headers.Authorization).toBe('Bearer new-token');

			fetchMock.mockResolvedValueOnce(json({ message: 'bye' }));
			await client.logout();
			expect(lastCall().url).toBe('/api/auth/logout');

			fetchMock.mockResolvedValueOnce(json({}));
			await client.getCurrentUser();
			expect(lastCall().headers.Authorization).toBeUndefined();
		});
	});

	describe('documents', () => {
		it('normalises paths in create, update and move bodies', async () => {
			await client.createDocument({
				metaData: { title: 'T', path: 'notes//a/' },
				content: 'x'
			} as never);
			expect(lastCall().url).toBe('/api/documents');
			expect(lastCall().init.method).toBe('POST');
			expect(JSON.parse(lastCall().init.body as string).metaData.path).toBe('/notes/a');

			await client.updateDocument('my slug', { metaData: { title: 'T' }, content: 'y' } as never);
			expect(lastCall().url).toBe('/api/documents/my%20slug');
			expect(lastCall().init.method).toBe('PUT');
			expect(JSON.parse(lastCall().init.body as string).metaData).toEqual({ title: 'T' });

			await client.moveDocument({ oldPath: 'a', newPath: 'b//c/' });
			expect(lastCall().url).toBe('/api/documents/move');
			expect(JSON.parse(lastCall().init.body as string)).toEqual({
				oldPath: '/a',
				newPath: '/b/c'
			});

			await client.moveFolder({ oldPath: 'f', newPath: 'g/' });
			expect(lastCall().url).toBe('/api/folders/move');
			expect(JSON.parse(lastCall().init.body as string)).toEqual({ oldPath: '/f', newPath: '/g' });
		});

		it('sends the save type with path updates and encodes path segments', async () => {
			await client.updateDocumentByPath(
				'my notes/a b',
				{ metaData: { title: 'T', path: 'my notes/a b' }, content: 'z' } as never,
				'auto'
			);

			expect(lastCall().url).toBe('/api/documents/my%20notes/a%20b');
			expect(lastCall().init.method).toBe('PUT');
			const body = JSON.parse(lastCall().init.body as string);
			expect(body.saveType).toBe('auto');
			expect(body.metaData.path).toBe('/my notes/a b');

			await client.updateDocumentByPath('a', { metaData: { title: 'T' }, content: '' } as never);
			expect(JSON.parse(lastCall().init.body as string).saveType).toBe('manual');
		});

		describe('checkDocumentExists', () => {
			it('maps 200 and 404 to true and false with a HEAD request', async () => {
				client.setAuthToken('tok');
				fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
				await expect(client.checkDocumentExists('a/b')).resolves.toBe(true);
				expect(lastCall().url).toBe('/api/documents/a/b');
				expect(lastCall().init.method).toBe('HEAD');
				expect(lastCall().headers).toEqual({ Authorization: 'Bearer tok' });

				fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
				await expect(client.checkDocumentExists('a/b')).resolves.toBe(false);
			});

			it('throws an envelope with the status code for other statuses', async () => {
				fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));

				const { error } = await settle(client.checkDocumentExists('a'));

				expect(envelope(error).code).toBe('INTERNAL_ERROR');
				expect(envelope(error).error).toContain('500');
			});

			it('runs the 401 handler before throwing UNAUTHORIZED', async () => {
				fetchMock.mockResolvedValue(new Response(null, { status: 401 }));

				const { error } = await settle(client.checkDocumentExists('a'));

				expect(envelope(error).code).toBe('UNAUTHORIZED');
				expect(authActions.clearAuth).toHaveBeenCalled();
			});

			it('reports network failures as NETWORK_ERROR', async () => {
				fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

				const { error } = await settle(client.checkDocumentExists('a'));

				expect(envelope(error)).toEqual({
					error: 'Network error while checking document existence: Failed to fetch',
					code: 'NETWORK_ERROR'
				});
			});
		});

		it('unwraps list responses', async () => {
			fetchMock.mockResolvedValueOnce(json({ folders: [{ path: '/a' }] }));
			await expect(client.getFolderTree()).resolves.toEqual([{ path: '/a' }]);

			// The server sends null (a nil Go slice) when there are no folders.
			fetchMock.mockResolvedValueOnce(json({ folders: null }));
			await expect(client.getFolderTree()).resolves.toEqual([]);

			fetchMock.mockResolvedValueOnce(json({ backlinks: [{ id: 'b' }], total: 1 }));
			await expect(client.getDocumentBacklinks('x y')).resolves.toEqual([{ id: 'b' }]);
			expect(lastCall().url).toBe('/api/links/backlinks/x%20y');

			fetchMock.mockResolvedValueOnce(json({ links: [{ target: 'c' }] }));
			await expect(client.getDocumentOutgoingLinks('x')).resolves.toEqual([{ target: 'c' }]);
			expect(lastCall().url).toBe('/api/links/outgoing/x');

			fetchMock.mockResolvedValueOnce(json({ templates: [{ name: 't' }] }));
			await expect(client.getTemplates()).resolves.toEqual([{ name: 't' }]);
			expect(lastCall().url).toBe('/api/templates');

			fetchMock.mockResolvedValueOnce(json({ diff: { hunks: [] } }));
			await expect(client.compareDocumentVersions('a', 'h1', 'h2')).resolves.toEqual({
				hunks: []
			});
			expect(lastCall().url).toBe('/api/versions/diff?path=%2Fa&hash1=h1&hash2=h2');
		});
	});

	describe('endpoint routing', () => {
		type Case = [
			name: string,
			call: (c: SchistApiClient) => Promise<unknown>,
			url: string,
			method?: string,
			body?: unknown
		];
		const cases: Case[] = [
			['getDocument', (c) => c.getDocument('a/b'), '/api/documents/a%2Fb'],
			['getDocumentByPath', (c) => c.getDocumentByPath('a/b'), '/api/documents/a/b'],
			['deleteDocumentByPath', (c) => c.deleteDocumentByPath('a'), '/api/documents/a', 'DELETE'],
			['createFolder', (c) => c.createFolder('x//y/'), '/api/folders', 'POST', { path: '/x/y' }],
			[
				'renameFolder',
				(c) => c.renameFolder('x/y', 'z'),
				'/api/folders/x/y',
				'PUT',
				{ newName: 'z' }
			],
			['deleteFolder', (c) => c.deleteFolder('x'), '/api/folders/x', 'DELETE'],
			['searchDocuments', (c) => c.searchDocuments('a & b'), '/api/search?q=a+%26+b'],
			['searchDocuments with limit', (c) => c.searchDocuments('x', 5), '/api/search?q=x&limit=5'],
			['getAllTags', (c) => c.getAllTags(), '/api/tags'],
			['listApiTokens', (c) => c.listApiTokens(), '/api/tokens'],
			[
				'createApiToken',
				(c) => c.createApiToken({ name: 'n', scope: 'read', expires_in_days: 0 }),
				'/api/tokens',
				'POST',
				{ name: 'n', scope: 'read', expires_in_days: 0 }
			],
			['revokeApiToken', (c) => c.revokeApiToken('a b'), '/api/tokens/a%20b', 'DELETE'],
			['getDocumentVersions', (c) => c.getDocumentVersions('a'), '/api/versions?path=%2Fa'],
			[
				'restoreDocumentToVersion',
				(c) => c.restoreDocumentToVersion('a', 'h'),
				'/api/versions/restore?path=%2Fa&hash=h',
				'POST'
			],
			['getGitHubSettings', (c) => c.getGitHubSettings(), '/api/github/config'],
			[
				'getGitHubConnectionStatus',
				(c) => c.getGitHubConnectionStatus(),
				'/api/github/connection-status'
			],
			[
				'updateGitHubSettings',
				(c) => c.updateGitHubSettings({ branch: 'main' } as never),
				'/api/github/config',
				'PUT',
				{ branch: 'main' }
			],
			[
				'setupGitHub',
				(c) => c.setupGitHub({ owner: 'o' } as never),
				'/api/github/setup',
				'POST',
				{ owner: 'o' }
			],
			[
				'testGitHubConnection',
				(c) => c.testGitHubConnection('t', 'o', 'r'),
				'/api/github/test',
				'POST',
				{ token: 't', owner: 'o', repo: 'r', branch: 'main' }
			],
			['syncToGitHub', (c) => c.syncToGitHub(), '/api/github/sync', 'POST'],
			['disconnectGitHub', (c) => c.disconnectGitHub(), '/api/github/disconnect', 'POST'],
			[
				'createShare',
				(c) => c.createShare({ documentPath: '/a' } as never),
				'/api/shares',
				'POST',
				{ documentPath: '/a' }
			],
			['getSharedDocument', (c) => c.getSharedDocument('t/1'), '/api/shares/t%2F1', 'GET'],
			['listShares', (c) => c.listShares(), '/api/shares', 'GET'],
			['revokeShare', (c) => c.revokeShare('s 1'), '/api/shares/s%201', 'DELETE'],
			['getPasskeyStatus', (c) => c.getPasskeyStatus(), '/api/passkeys/status'],
			['listPasskeys', (c) => c.listPasskeys(), '/api/passkeys'],
			['deletePasskey', (c) => c.deletePasskey('id/1'), '/api/passkeys/id%2F1', 'DELETE'],
			[
				'unlockWithPasskey',
				(c) => c.unlockWithPasskey({ authTicket: 't' } as never),
				'/api/passkeys/unlock',
				'POST',
				{ authTicket: 't' }
			],
			[
				'beginPasskeyRegistration',
				(c) => c.beginPasskeyRegistration({ name: 'k' } as never),
				'/api/passkeys/register/begin',
				'POST',
				{ name: 'k' }
			],
			[
				'finishPasskeyRegistration',
				(c) => c.finishPasskeyRegistration({ name: 'k' } as never),
				'/api/passkeys/register/finish',
				'POST',
				{ name: 'k' }
			],
			[
				'beginPasskeyAuthentication',
				(c) => c.beginPasskeyAuthentication(),
				'/api/passkeys/authenticate/begin',
				'POST'
			],
			[
				'finishPasskeyAuthentication',
				(c) => c.finishPasskeyAuthentication({ id: 'x' } as never),
				'/api/passkeys/authenticate/finish',
				'POST',
				{ id: 'x' }
			],
			['getSecretsStatus', (c) => c.getSecretsStatus(), '/api/secrets/status'],
			['lockSecrets', (c) => c.lockSecrets(), '/api/secrets/lock', 'POST'],
			['listSecrets', (c) => c.listSecrets(), '/api/secrets'],
			[
				'createSecret',
				(c) => c.createSecret({ key: 'k', value: 'v' } as never),
				'/api/secrets',
				'POST',
				{ key: 'k', value: 'v' }
			],
			['getSecret', (c) => c.getSecret('a b'), '/api/secrets/a%20b'],
			[
				'updateSecret',
				(c) => c.updateSecret('k', { value: 'v' } as never),
				'/api/secrets/k',
				'PUT',
				{ value: 'v' }
			],
			['deleteSecret', (c) => c.deleteSecret('k'), '/api/secrets/k', 'DELETE'],
			['checkSetupRequired', (c) => c.checkSetupRequired(), '/api/auth/setup/required'],
			[
				'createFirstUser',
				(c) => c.createFirstUser({ username: 'a' } as never),
				'/api/auth/setup/first-user',
				'POST',
				{ username: 'a' }
			],
			['generateInviteToken', (c) => c.generateInviteToken(), '/api/auth/invite', 'POST'],
			[
				'createUserFromInvite',
				(c) => c.createUserFromInvite({ token: 't' } as never),
				'/api/auth/setup/invite-user',
				'POST',
				{ token: 't' }
			],
			['listUsers', (c) => c.listUsers(), '/api/auth/users'],
			['deleteUser', (c) => c.deleteUser('a b'), '/api/auth/users/a%20b', 'DELETE'],
			['checkGitHealth', (c) => c.checkGitHealth(), '/api/git/health'],
			['repairGitRepository', (c) => c.repairGitRepository(), '/api/git/repair', 'POST']
		];

		it.each(cases)('%s', async (_name, call, url, method, body) => {
			await call(client);

			const { url: calledUrl, init } = lastCall();
			expect(calledUrl).toBe(url);
			expect(init.method ?? 'GET').toBe(method ?? 'GET');
			if (body === undefined) {
				expect(init.body).toBeUndefined();
			} else {
				expect(JSON.parse(init.body as string)).toEqual(body);
			}
		});
	});

	describe('assets and export', () => {
		it('maps asset paths to the uploads route', () => {
			expect(client.getAssetUrl('/assets/img/a.png')).toBe('/uploads/img/a.png');
		});

		it('opens folder and full exports in a new tab', async () => {
			const open = vi.spyOn(window, 'open').mockReturnValue(null);

			await client.exportFolder('my folder');
			await client.exportAll();

			expect(open).toHaveBeenNthCalledWith(1, '/api/export/folder/my%20folder', '_blank');
			expect(open).toHaveBeenNthCalledWith(2, '/api/export/all', '_blank');
		});

		it('downloads a document under the server-provided filename', async () => {
			client.setAuthToken('tok');
			fetchMock.mockResolvedValueOnce(
				new Response('# a', {
					headers: { 'content-disposition': 'attachment; filename="note.md"' }
				})
			);
			vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
			const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
			let downloaded = '';
			vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
				this: HTMLAnchorElement
			) {
				downloaded = this.download;
			});

			await client.exportDocument('a b');

			expect(lastCall().url).toBe('/api/export/document/a%20b');
			expect(lastCall().headers).toEqual({ Authorization: 'Bearer tok' });
			expect(downloaded).toBe('note.md');
			expect(revoke).toHaveBeenCalledWith('blob:x');
		});

		it('defaults the download name and rejects failed exports', async () => {
			fetchMock.mockResolvedValueOnce(new Response('x'));
			vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:y');
			vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
			let downloaded = '';
			vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
				this: HTMLAnchorElement
			) {
				downloaded = this.download;
			});

			await client.exportDocument('a');
			expect(downloaded).toBe('document.md');

			fetchMock.mockResolvedValueOnce(new Response('', { status: 500, statusText: 'Boom' }));
			await expect(client.exportDocument('a')).rejects.toThrow('Export failed: Boom');
		});
	});

	describe('uploadImage', () => {
		class FakeXHR {
			static last: FakeXHR;
			status = 0;
			responseText = '';
			method = '';
			url = '';
			headers: Record<string, string> = {};
			body: unknown;
			private listeners: Record<string, () => void> = {};
			upload = {
				listeners: {} as Record<string, (e: ProgressEvent) => void>,
				addEventListener(type: string, fn: (e: ProgressEvent) => void) {
					this.listeners[type] = fn;
				}
			};
			constructor() {
				FakeXHR.last = this;
			}
			addEventListener(type: string, fn: () => void) {
				this.listeners[type] = fn;
			}
			open(method: string, url: string) {
				this.method = method;
				this.url = url;
			}
			setRequestHeader(name: string, value: string) {
				this.headers[name] = value;
			}
			send(body: unknown) {
				this.body = body;
			}
			respond(status: number, text: string) {
				this.status = status;
				this.responseText = text;
				this.listeners.load();
			}
			fail() {
				this.listeners.error();
			}
		}

		const file = new File(['png'], 'a.png', { type: 'image/png' });

		beforeEach(() => {
			vi.stubGlobal('XMLHttpRequest', FakeXHR);
		});

		it('posts the file with the token, reports progress and resolves the asset', async () => {
			client.setAuthToken('tok');
			const onProgress = vi.fn();

			const promise = client.uploadImage(file, onProgress);
			const xhr = FakeXHR.last;
			expect(xhr.method).toBe('POST');
			expect(xhr.url).toBe('/api/assets/upload');
			expect(xhr.headers).toEqual({ Authorization: 'Bearer tok' });
			expect((xhr.body as FormData).get('file')).toBeInstanceOf(File);

			xhr.upload.listeners.progress({
				lengthComputable: true,
				loaded: 1,
				total: 4
			} as ProgressEvent);
			xhr.upload.listeners.progress({ lengthComputable: false } as ProgressEvent);
			expect(onProgress).toHaveBeenCalledTimes(1);
			expect(onProgress).toHaveBeenCalledWith(25);

			xhr.respond(201, JSON.stringify({ asset: { path: '/assets/a.png' } }));
			await expect(promise).resolves.toEqual({ path: '/assets/a.png' });
		});

		it('rejects unparseable success bodies', async () => {
			const promise = client.uploadImage(file);
			FakeXHR.last.respond(200, 'not json');
			await expect(promise).rejects.toThrow('Failed to parse response');
		});

		it('rejects with the server envelope, filling in a missing code', async () => {
			const promise = client.uploadImage(file);
			FakeXHR.last.respond(413, JSON.stringify({ error: 'Too big', details: { max: 1 } }));
			const error = await promise.catch((e: Error) => e);
			expect(envelope(error as Error)).toEqual({
				error: 'Too big',
				code: undefined,
				details: { max: 1 }
			});

			const second = client.uploadImage(file);
			FakeXHR.last.respond(400, JSON.stringify({ code: 'VALIDATION_ERROR' }));
			const err2 = await second.catch((e: Error) => e);
			expect(envelope(err2 as Error)).toEqual({ error: 'Upload failed', code: 'VALIDATION_ERROR' });
		});

		it('builds an envelope from the status for non-JSON errors and handles 401', async () => {
			const promise = client.uploadImage(file);
			FakeXHR.last.respond(401, '<html>');
			const error = await promise.catch((e: Error) => e);
			expect(envelope(error as Error)).toEqual({
				error: 'Upload failed with status 401',
				code: 'UNAUTHORIZED'
			});
			await vi.runAllTimersAsync();
			expect(authActions.clearAuth).toHaveBeenCalled();
		});

		it('rejects network errors as NETWORK_ERROR', async () => {
			const promise = client.uploadImage(file);
			FakeXHR.last.fail();
			const error = await promise.catch((e: Error) => e);
			expect(envelope(error as Error)).toEqual({
				error: 'Network error during upload',
				code: 'NETWORK_ERROR'
			});
		});
	});
});
