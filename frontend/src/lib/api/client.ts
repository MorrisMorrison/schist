import { env } from '$env/dynamic/public';
import type {
	Document,
	CreateDocumentRequest,
	UpdateDocumentRequest,
	DocumentListResponse,
	Folder,
	FolderTreeResponse,
	MoveDocumentRequest,
	MoveDocumentResponse,
	FolderOperationResponse,
	CreateDocumentResponse,
	Asset,
	AssetUploadResponse,
	SearchResult,
	TagsResponse,
	Template,
	TemplatesResponse,
	VersionsResponse,
	DiffResult,
	RestoreResponse,
	ImportOptions,
	ImportResult,
	GitHubSettings,
	GitHubConnectionStatus,
	GitHubSyncResult,
	GitHubSetupRequest,
	GitHubConfigRequest,
	GitHubSetupResponse,
	GitHubConnectionTest,
	User,
	LoginResponse,
	AppConfig,
	ShareToken,
	CreateShareRequest,
	ShareListResponse,
	PasskeyStatus,
	PasskeyUnlockRequest,
	PasskeyLoginRequest,
	PasskeyListResponse,
	WebAuthnBeginRegistrationRequest,
	WebAuthnBeginRegistrationResponse,
	WebAuthnFinishRegistrationRequest,
	WebAuthnFinishRegistrationResponse,
	WebAuthnBeginAuthenticationResponse,
	WebAuthnFinishAuthenticationRequest,
	WebAuthnFinishAuthenticationResponse,
	SecretsStatus,
	CreateSecretRequest,
	UpdateSecretRequest,
	SecretListResponse,
	SecretValueResponse,
	SetupStatusResponse,
	GenerateInviteTokenResponse,
	CreateUserFromInviteRequest,
	CreateFirstUserRequest,
	UserInfo,
	WikiLink,
	OutgoingLinksResponse
} from './types';
import { buildApiEndpoint, encodePath, normalizePath } from '$lib/utils/path';
import { parseError, getErrorCodeFromStatus } from '$lib/utils/error';
import { requestDeduplicator, createRequestKey } from '$lib/utils/request-deduplication';

class SchistApiClient {
	private baseUrl: string;
	private authToken: string | null = null;
	private configCache: AppConfig | null = null;

	constructor() {
		this.baseUrl = this.determineApiUrl();
	}

	setAuthToken(token: string | null) {
		this.authToken = token;
	}

	// Prefer the in-memory token, but fall back to localStorage so a request that
	// fires before the auth store has called setAuthToken() (a module-init race)
	// still carries the Bearer token instead of going out unauthenticated and
	// triggering a spurious 401 -> global logout -> /login redirect. The key must
	// match AUTH_STORAGE_KEY in stores/auth.svelte.ts.
	private getAuthToken(): string | null {
		if (this.authToken) return this.authToken;
		try {
			return typeof localStorage !== 'undefined' ? localStorage.getItem('schist_auth_token') : null;
		} catch {
			return null;
		}
	}

	private determineApiUrl(): string {
		if (env.PUBLIC_API_URL) {
			return env.PUBLIC_API_URL;
		}

		if (typeof window !== 'undefined') {
			console.debug('API Client: Using relative API path /api (PUBLIC_API_URL not set)', {
				hostname: window.location.hostname,
				protocol: window.location.protocol,
				port: window.location.port
			});
		}

		return '/api';
	}

	private authHeaders(): Record<string, string> {
		const headers: Record<string, string> = {};
		const token = this.getAuthToken();
		if (token) {
			headers.Authorization = `Bearer ${token}`;
		}
		return headers;
	}

	private normalizeDocumentData<T extends CreateDocumentRequest | UpdateDocumentRequest>(
		documentData: T
	): T {
		return {
			...documentData,
			metaData: {
				...documentData.metaData,
				...(documentData.metaData.path && { path: normalizePath(documentData.metaData.path) })
			}
		};
	}

	private async handleAuthenticationError() {
		// A single 401 can be transient (a brief server hiccup, or a request that
		// raced token attachment) rather than a genuinely dead session. Confirm the
		// session is actually invalid before tearing it down -- otherwise a stray
		// 401 bounces a valid session to /login.
		if (await this.isSessionStillValid()) {
			return;
		}

		// Clear auth state through the store (will automatically clear API client token)
		const { authActions } = await import('$lib/stores/auth.svelte');
		authActions.clearAuth();

		// Use centralized auth service for redirect logic (includes public route check)
		const { authService } = await import('$lib/auth/auth-service');
		const returnUrl = window.location.pathname + window.location.search;
		await authService.requireAuth(returnUrl);
	}

	private revalidating: Promise<boolean> | null = null;

	// Re-check the stored token against /auth/me to decide whether a 401 was real.
	// Returns true if the session is still good (so we must NOT log out). Only a
	// confirmed 401 counts as invalid; a 200 keeps the session, and anything
	// inconclusive (network error, 404, 5xx) also keeps it -- we never tear down a
	// session on uncertainty. Deduplicated so a burst of 401s shares one check, and
	// it uses a raw fetch (not request()) to avoid re-entering this handler.
	private async isSessionStillValid(): Promise<boolean> {
		if (this.revalidating) return this.revalidating;
		this.revalidating = (async () => {
			const token = this.getAuthToken();
			if (!token) return false;
			for (let attempt = 0; attempt < 2; attempt++) {
				try {
					const res = await fetch(`${this.baseUrl}/auth/me`, {
						headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
					});
					if (res.ok) return true;
					if (res.status === 401) return false;
					// 404 / 5xx: inconclusive -> retry, then keep the session below
				} catch {
					// network error: inconclusive -> retry, then keep the session below
				}
				await new Promise((resolve) => setTimeout(resolve, 300));
			}
			return true;
		})();
		try {
			return await this.revalidating;
		} finally {
			this.revalidating = null;
		}
	}

	private encodePath(path: string): string {
		return encodePath(path);
	}

	private async request<T>(
		endpoint: string,
		options: RequestInit = {},
		deduplicateOptions: { enableDeduplication?: boolean; force?: boolean } = {}
	): Promise<T> {
		const { enableDeduplication = false, force = false } = deduplicateOptions;

		const executeRequest = async (): Promise<T> => {
			const url = `${this.baseUrl}${endpoint}`;

			const defaultHeaders: Record<string, string> = {
				'Content-Type': 'application/json',
				Accept: 'application/json'
			};

			const token = this.getAuthToken();
			if (token) {
				defaultHeaders.Authorization = `Bearer ${token}`;
			}

			const config: RequestInit = {
				...options,
				headers: {
					...defaultHeaders,
					...options.headers
				}
			};

			if (options.body instanceof FormData) {
				delete (config.headers as Record<string, string>)['Content-Type'];
			}

			// A 401 can be a transient server hiccup (the backend briefly
			// overloaded or restarting) rather than a genuinely invalid session.
			// Retry a couple of times before the 401 handler tears the session down
			// and bounces the user to /login: a valid token recovers on retry, an
			// invalid one keeps returning 401.
			let response = await fetch(url, config);
			for (let attempt = 0; response.status === 401 && attempt < 2; attempt++) {
				await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
				response = await fetch(url, config);
			}

			if (!response.ok) {
				const errorText = await response.text();
				let errorData;

				try {
					errorData = JSON.parse(errorText);
				} catch {
					errorData = {
						error: errorText || response.statusText || `HTTP ${response.status} Error`,
						code: getErrorCodeFromStatus(response.status)
					};
				}

				console.error('API Request failed', {
					url,
					status: response.status,
					statusText: response.statusText,
					errorData,
					headers: Object.fromEntries(response.headers.entries())
				});

				if (response.status === 401) {
					await this.handleAuthenticationError();
				}

				const error = new Error(JSON.stringify(errorData));
				throw error;
			}

			if (response.status === 204 || response.headers.get('content-length') === '0') {
				return {} as T;
			}

			const data = await response.json();
			return data;
		};

		if (enableDeduplication) {
			const cacheKey = createRequestKey(endpoint, options);
			return requestDeduplicator.deduplicate(cacheKey, executeRequest, { force });
		}

		try {
			return await executeRequest();
		} catch (error) {
			const parsedError = parseError(error);
			const url = `${this.baseUrl}${endpoint}`;
			console.error('API Request error', {
				url,
				error: parsedError.message,
				code: parsedError.code,
				severity: parsedError.severity,
				originalError: error instanceof Error ? error.message : 'Unknown error',
				stack: error instanceof Error ? error.stack : undefined
			});

			// Re-throw the error to preserve its structure
			throw error;
		}
	}

	private async deduplicatedRequest<T>(
		endpoint: string,
		options: RequestInit = {},
		force = false
	): Promise<T> {
		return this.request<T>(endpoint, options, { enableDeduplication: true, force });
	}

	async getConfig(): Promise<AppConfig> {
		if (this.configCache) {
			return this.configCache;
		}
		const config = await this.request<AppConfig>('/config');
		this.configCache = config;
		return config;
	}

	async loginWithPasskey(authTicket: string): Promise<LoginResponse> {
		const response = await this.request<LoginResponse>('/auth/login/passkey', {
			method: 'POST',
			body: JSON.stringify({ authTicket } satisfies PasskeyLoginRequest)
		});

		this.setAuthToken(response.token);

		return response;
	}

	async logout(): Promise<{ message: string }> {
		const response = await this.request<{ message: string }>('/auth/logout', {
			method: 'POST'
		});

		this.setAuthToken(null);

		return response;
	}

	async getCurrentUser(): Promise<User> {
		return this.request<User>('/auth/me');
	}

	async getDocuments(force = false): Promise<Document[]> {
		const response = await this.deduplicatedRequest<DocumentListResponse>('/documents', {}, force);
		return response.documents;
	}

	async getDocument(slug: string): Promise<Document> {
		return this.request<Document>(`/documents/${encodeURIComponent(slug)}`);
	}

	async createDocument(documentData: CreateDocumentRequest): Promise<CreateDocumentResponse> {
		const normalizedDocumentData = this.normalizeDocumentData(documentData);

		return this.request<CreateDocumentResponse>('/documents', {
			method: 'POST',
			body: JSON.stringify(normalizedDocumentData)
		});
	}

	async updateDocument(slug: string, documentData: UpdateDocumentRequest): Promise<Document> {
		const normalizedDocumentData = this.normalizeDocumentData(documentData);

		return this.request<Document>(`/documents/${encodeURIComponent(slug)}`, {
			method: 'PUT',
			body: JSON.stringify(normalizedDocumentData)
		});
	}

	async getDocumentByPath(path: string): Promise<Document> {
		return this.request<Document>(buildApiEndpoint('/documents', path));
	}

	async checkDocumentExists(path: string): Promise<boolean> {
		const url = `${this.baseUrl}${buildApiEndpoint('/documents', path)}`;

		try {
			const response = await fetch(url, {
				method: 'HEAD',
				headers: this.authHeaders()
			});

			if (response.status === 200) {
				return true;
			} else if (response.status === 404) {
				return false;
			} else if (response.status === 401) {
				await this.handleAuthenticationError();
				throw new Error('Authentication required');
			} else {
				throw new Error(
					`Failed to check document existence: ${response.status} ${response.statusText}`
				);
			}
		} catch (error) {
			if (error instanceof Error && error.message === 'Authentication required') {
				throw error;
			}
			if (error instanceof TypeError) {
				// TypeError is thrown by fetch for network errors
				throw new Error(`Network error while checking document existence: ${error.message}`);
			}
			throw new Error(
				`Unexpected error while checking document existence: ${error instanceof Error ? error.message : 'Unknown error'}`
			);
		}
	}

	async updateDocumentByPath(
		path: string,
		documentData: UpdateDocumentRequest,
		saveType: 'manual' | 'auto' = 'manual'
	): Promise<Document> {
		const normalizedDocumentData = {
			...this.normalizeDocumentData(documentData),
			saveType
		};

		return this.request<Document>(buildApiEndpoint('/documents', path), {
			method: 'PUT',
			body: JSON.stringify(normalizedDocumentData)
		});
	}

	async deleteDocumentByPath(path: string): Promise<void> {
		await this.request<void>(buildApiEndpoint('/documents', path), {
			method: 'DELETE'
		});
	}

	async getFolderTree(force = false): Promise<Folder[]> {
		const response = await this.deduplicatedRequest<FolderTreeResponse>('/folders', {}, force);
		return response.folders;
	}

	async createFolder(path: string): Promise<FolderOperationResponse> {
		const normalizedPath = normalizePath(path);
		return this.request<FolderOperationResponse>('/folders', {
			method: 'POST',
			body: JSON.stringify({ path: normalizedPath })
		});
	}

	async renameFolder(path: string, newName: string): Promise<FolderOperationResponse> {
		return this.request<FolderOperationResponse>(buildApiEndpoint('/folders', path), {
			method: 'PUT',
			body: JSON.stringify({ newName })
		});
	}

	async deleteFolder(path: string): Promise<FolderOperationResponse> {
		return this.request<FolderOperationResponse>(buildApiEndpoint('/folders', path), {
			method: 'DELETE'
		});
	}

	async moveDocument(moveRequest: MoveDocumentRequest): Promise<MoveDocumentResponse> {
		const normalizedRequest = {
			oldPath: normalizePath(moveRequest.oldPath),
			newPath: normalizePath(moveRequest.newPath)
		};
		return this.request<MoveDocumentResponse>('/documents/move', {
			method: 'POST',
			body: JSON.stringify(normalizedRequest)
		});
	}

	async moveFolder(moveRequest: MoveDocumentRequest): Promise<MoveDocumentResponse> {
		const normalizedRequest = {
			oldPath: normalizePath(moveRequest.oldPath),
			newPath: normalizePath(moveRequest.newPath)
		};
		return this.request<MoveDocumentResponse>('/folders/move', {
			method: 'POST',
			body: JSON.stringify(normalizedRequest)
		});
	}

	async searchDocuments(query: string): Promise<SearchResult> {
		const params = new URLSearchParams({ q: query });
		return this.request<SearchResult>(`/search?${params}`);
	}

	async getAllTags(): Promise<TagsResponse> {
		return this.request<TagsResponse>('/tags');
	}

	async getDocumentBacklinks(path: string): Promise<Document[]> {
		const response = await this.request<{ backlinks: Document[]; total: number }>(
			buildApiEndpoint('/links/backlinks', path)
		);
		return response.backlinks;
	}

	async getDocumentOutgoingLinks(path: string): Promise<WikiLink[]> {
		const response = await this.request<OutgoingLinksResponse>(
			buildApiEndpoint('/links/outgoing', path)
		);
		return response.links;
	}

	async getDocumentVersions(path: string, options?: RequestInit): Promise<VersionsResponse> {
		const normalizedPath = normalizePath(path);
		const params = new URLSearchParams({ path: normalizedPath });
		return this.request<VersionsResponse>(`/versions?${params}`, options);
	}

	async compareDocumentVersions(path: string, hash1: string, hash2: string): Promise<DiffResult> {
		const normalizedPath = normalizePath(path);
		const params = new URLSearchParams({
			path: normalizedPath,
			hash1,
			hash2
		});
		const response = await this.request<{ diff: DiffResult }>(`/versions/diff?${params}`);
		return response.diff;
	}

	async restoreDocumentToVersion(path: string, hash: string): Promise<RestoreResponse> {
		const normalizedPath = normalizePath(path);
		const params = new URLSearchParams({
			path: normalizedPath,
			hash
		});
		return this.request<RestoreResponse>(`/versions/restore?${params}`, {
			method: 'POST'
		});
	}

	async uploadImage(file: File, onProgress?: (progress: number) => void): Promise<Asset> {
		const formData = new FormData();
		formData.append('file', file);

		const url = `${this.baseUrl}/assets/upload`;

		return new Promise((resolve, reject) => {
			const xhr = new XMLHttpRequest();

			if (onProgress) {
				xhr.upload.addEventListener('progress', (event) => {
					if (event.lengthComputable) {
						const progress = (event.loaded / event.total) * 100;
						onProgress(progress);
					}
				});
			}

			xhr.addEventListener('load', () => {
				if (xhr.status >= 200 && xhr.status < 300) {
					try {
						const response: AssetUploadResponse = JSON.parse(xhr.responseText);
						resolve(response.asset);
					} catch {
						reject(new Error('Failed to parse response'));
					}
				} else {
					try {
						const errorResponse = JSON.parse(xhr.responseText);
						reject(new Error(errorResponse.error || 'Upload failed'));
					} catch {
						reject(new Error(`Upload failed with status ${xhr.status}`));
					}
				}
			});

			xhr.addEventListener('error', () => {
				reject(new Error('Network error during upload'));
			});

			xhr.open('POST', url);

			// Add authorization header if we have a token
			for (const [name, value] of Object.entries(this.authHeaders())) {
				xhr.setRequestHeader(name, value);
			}

			xhr.send(formData);
		});
	}

	async importDocuments(files: FileList, options: ImportOptions): Promise<ImportResult> {
		const formData = new FormData();

		for (let i = 0; i < files.length; i++) {
			formData.append('files', files[i]);
		}

		formData.append('target_path', options.target_path);
		formData.append('overwrite_mode', options.overwrite_mode);

		return this.request<ImportResult>('/import/documents', {
			method: 'POST',
			body: formData
		});
	}

	getAssetUrl(path: string): string {
		const uploadsPath = path.replace('/assets/', '/uploads/');

		const apiUrl = this.baseUrl;

		if (apiUrl === '/api') {
			return uploadsPath;
		}

		const serverRoot = apiUrl.replace('/api', '');
		return `${serverRoot}${uploadsPath}`;
	}

	async exportDocument(path: string): Promise<void> {
		const encodedPath = this.encodePath(path);
		const url = `${this.baseUrl}/export/document${encodedPath}`;

		try {
			const response = await fetch(url, {
				method: 'GET',
				headers: this.authHeaders()
			});

			if (!response.ok) {
				throw new Error(`Export failed: ${response.statusText}`);
			}

			const contentDisposition = response.headers.get('content-disposition');
			let filename = 'document.md';
			if (contentDisposition) {
				const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(contentDisposition);
				if (matches != null && matches[1]) {
					filename = matches[1].replace(/['"]/g, '');
				}
			}

			const blob = await response.blob();
			const downloadUrl = window.URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = downloadUrl;
			a.download = filename;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			window.URL.revokeObjectURL(downloadUrl);
		} catch (error) {
			console.error('Export failed:', error);
			throw error;
		}
	}

	async exportFolder(path: string): Promise<void> {
		const encodedPath = this.encodePath(path);
		const url = `${this.baseUrl}/export/folder${encodedPath}`;

		window.open(url, '_blank');
	}

	async exportAll(): Promise<void> {
		const url = `${this.baseUrl}/export/all`;

		window.open(url, '_blank');
	}

	// New separated GitHub API methods
	async getGitHubSettings(force = false): Promise<GitHubSettings> {
		return this.deduplicatedRequest<GitHubSettings>('/github/config', {}, force);
	}

	async getGitHubConnectionStatus(force = false): Promise<GitHubConnectionStatus> {
		return this.deduplicatedRequest<GitHubConnectionStatus>('/github/connection-status', {}, force);
	}

	async updateGitHubSettings(settings: GitHubConfigRequest): Promise<GitHubSettings> {
		return this.request<GitHubSettings>('/github/config', {
			method: 'PUT',
			body: JSON.stringify(settings)
		});
	}

	async setupGitHub(setupRequest: GitHubSetupRequest): Promise<GitHubSetupResponse> {
		return this.request<GitHubSetupResponse>('/github/setup', {
			method: 'POST',
			body: JSON.stringify(setupRequest)
		});
	}

	async testGitHubConnection(
		token: string,
		owner: string,
		repository: string
	): Promise<GitHubConnectionTest> {
		return this.request<GitHubConnectionTest>('/github/test', {
			method: 'POST',
			body: JSON.stringify({ token, owner, repo: repository, branch: 'main' })
		});
	}

	async syncToGitHub(): Promise<GitHubSyncResult> {
		return this.request<GitHubSyncResult>('/github/sync', {
			method: 'POST'
		});
	}

	async disconnectGitHub(): Promise<{
		message: string;
		settings: GitHubSettings;
		connection: GitHubConnectionStatus;
	}> {
		return this.request<{
			message: string;
			settings: GitHubSettings;
			connection: GitHubConnectionStatus;
		}>('/github/disconnect', {
			method: 'POST'
		});
	}

	// Share management
	async createShare(request: CreateShareRequest): Promise<ShareToken> {
		return this.request<ShareToken>('/shares', {
			method: 'POST',
			body: JSON.stringify(request)
		});
	}

	async getSharedDocument(token: string): Promise<Document> {
		return this.request<Document>(`/shares/${token}`, {
			method: 'GET'
		});
	}

	async listShares(): Promise<ShareListResponse> {
		return this.request<ShareListResponse>('/shares', {
			method: 'GET'
		});
	}

	async revokeShare(shareId: string): Promise<{ message: string }> {
		return this.request<{ message: string }>(`/shares/${shareId}`, {
			method: 'DELETE'
		});
	}

	// Passkey management methods
	async getPasskeyStatus(force = false): Promise<PasskeyStatus> {
		return this.deduplicatedRequest<PasskeyStatus>('/passkeys/status', {}, force);
	}

	async listPasskeys(force = false): Promise<PasskeyListResponse> {
		return this.deduplicatedRequest<PasskeyListResponse>('/passkeys', {}, force);
	}

	async deletePasskey(credentialId: string): Promise<{ message: string }> {
		return this.request<{ message: string }>(`/passkeys/${credentialId}`, {
			method: 'DELETE'
		});
	}

	async unlockWithPasskey(request: PasskeyUnlockRequest): Promise<{ message: string }> {
		return this.request<{ message: string }>('/passkeys/unlock', {
			method: 'POST',
			body: JSON.stringify(request)
		});
	}

	// WebAuthn passkey methods
	async beginPasskeyRegistration(
		request: WebAuthnBeginRegistrationRequest
	): Promise<WebAuthnBeginRegistrationResponse> {
		return this.request<WebAuthnBeginRegistrationResponse>('/passkeys/register/begin', {
			method: 'POST',
			body: JSON.stringify(request)
		});
	}

	async finishPasskeyRegistration(
		request: WebAuthnFinishRegistrationRequest
	): Promise<WebAuthnFinishRegistrationResponse> {
		return this.request<WebAuthnFinishRegistrationResponse>('/passkeys/register/finish', {
			method: 'POST',
			body: JSON.stringify(request)
		});
	}

	async beginPasskeyAuthentication(): Promise<WebAuthnBeginAuthenticationResponse> {
		return this.request<WebAuthnBeginAuthenticationResponse>('/passkeys/authenticate/begin', {
			method: 'POST'
		});
	}

	async finishPasskeyAuthentication(
		request: WebAuthnFinishAuthenticationRequest
	): Promise<WebAuthnFinishAuthenticationResponse> {
		return this.request<WebAuthnFinishAuthenticationResponse>('/passkeys/authenticate/finish', {
			method: 'POST',
			body: JSON.stringify(request)
		});
	}

	// Secret management methods
	async getSecretsStatus(force = false): Promise<SecretsStatus> {
		return this.deduplicatedRequest<SecretsStatus>('/secrets/status', {}, force);
	}

	// Password-based unlock removed - secrets unlocked via passkey authentication

	async lockSecrets(): Promise<{ message: string }> {
		return this.request<{ message: string }>('/secrets/lock', {
			method: 'POST'
		});
	}

	async listSecrets(force = false): Promise<SecretListResponse> {
		return this.deduplicatedRequest<SecretListResponse>('/secrets', {}, force);
	}

	async createSecret(request: CreateSecretRequest): Promise<{ message: string }> {
		return this.request<{ message: string }>('/secrets', {
			method: 'POST',
			body: JSON.stringify(request)
		});
	}

	async getSecret(key: string): Promise<SecretValueResponse> {
		return this.request<SecretValueResponse>(`/secrets/${encodeURIComponent(key)}`);
	}

	async updateSecret(key: string, request: UpdateSecretRequest): Promise<{ message: string }> {
		return this.request<{ message: string }>(`/secrets/${encodeURIComponent(key)}`, {
			method: 'PUT',
			body: JSON.stringify(request)
		});
	}

	async deleteSecret(key: string): Promise<{ message: string }> {
		return this.request<{ message: string }>(`/secrets/${encodeURIComponent(key)}`, {
			method: 'DELETE'
		});
	}

	// Setup and user management methods
	async checkSetupRequired(): Promise<SetupStatusResponse> {
		return this.request<SetupStatusResponse>('/auth/setup/required');
	}

	async createFirstUser(
		request: CreateFirstUserRequest
	): Promise<{ message: string; username: string }> {
		return this.request<{ message: string; username: string }>('/auth/setup/first-user', {
			method: 'POST',
			body: JSON.stringify(request)
		});
	}

	async generateInviteToken(): Promise<GenerateInviteTokenResponse> {
		return this.request<GenerateInviteTokenResponse>('/auth/invite', {
			method: 'POST'
		});
	}

	async createUserFromInvite(
		request: CreateUserFromInviteRequest
	): Promise<{ message: string; username: string }> {
		return this.request<{ message: string; username: string }>('/auth/setup/invite-user', {
			method: 'POST',
			body: JSON.stringify(request)
		});
	}

	// User management methods
	async listUsers(): Promise<{ users: UserInfo[] }> {
		return this.request<{ users: UserInfo[] }>('/auth/users');
	}

	async deleteUser(username: string): Promise<{ message: string }> {
		return this.request<{ message: string }>(`/auth/users/${encodeURIComponent(username)}`, {
			method: 'DELETE'
		});
	}

	async getTemplates(force = false): Promise<Template[]> {
		const response = await this.deduplicatedRequest<TemplatesResponse>('/templates', {}, force);
		return response.templates;
	}

	async checkGitHealth(): Promise<{ healthy: boolean; message?: string; error?: string }> {
		return this.request<{ healthy: boolean; message?: string; error?: string }>('/git/health');
	}

	async repairGitRepository(): Promise<{ success: boolean; message?: string; error?: string }> {
		return this.request<{ success: boolean; message?: string; error?: string }>('/git/repair', {
			method: 'POST'
		});
	}
}

export const apiClient = new SchistApiClient();

export { SchistApiClient };
