import { env } from '$env/dynamic/public';
import type {
	Document,
	CreateDocumentRequest,
	UpdateDocumentRequest,
	HealthResponse,
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
	VersionsResponse,
	DiffResult,
	RestoreResponse,
	ImportOptions,
	ImportResult,
	GitHubStatus,
	GitHubSyncResult,
	GitHubSetupRequest,
	GitHubConfigRequest,
	GitHubSetupResponse,
	GitHubConnectionTest
} from './types.js';
import { normalizePath } from './types.js';

class SchістApiClient {
	private baseUrl: string;

	constructor() {
		this.baseUrl = this.determineApiUrl();
	}

	private determineApiUrl(): string {
		if (env.PUBLIC_API_URL) {
			return env.PUBLIC_API_URL;
		}

		return '/api';
	}

	private getApiUrl(): string {
		return this.baseUrl;
	}

	private encodePath(path: string): string {
		const normalizedPath = normalizePath(path);

		const segments = normalizedPath.split('/');
		const encodedSegments = segments.map((segment) =>
			segment ? encodeURIComponent(segment) : segment
		);
		return encodedSegments.join('/');
	}

	private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
		const url = `${this.getApiUrl()}${endpoint}`;

		const defaultHeaders = {
			'Content-Type': 'application/json',
			Accept: 'application/json'
		};

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

		try {
			const response = await fetch(url, config);

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
			}

			if (response.status === 204 || response.headers.get('content-length') === '0') {
				return {} as T;
			}

			const data = await response.json();
			return data;
		} catch (error) {
			if (error instanceof Error) {
				throw error;
			}
			throw new Error('Unknown API error occurred');
		}
	}

	async health(): Promise<HealthResponse> {
		return this.request<HealthResponse>('/health');
	}

	async getDocuments(): Promise<Document[]> {
		const response = await this.request<DocumentListResponse>('/documents');
		return response.documents;
	}

	async getDocument(slug: string): Promise<Document> {
		return this.request<Document>(`/documents/${encodeURIComponent(slug)}`);
	}

	async createDocument(documentData: CreateDocumentRequest): Promise<CreateDocumentResponse> {
		const normalizedDocumentData = {
			...documentData,
			metaData: {
				...documentData.metaData,
				...(documentData.metaData.path && { path: normalizePath(documentData.metaData.path) })
			}
		};

		return this.request<CreateDocumentResponse>('/documents', {
			method: 'POST',
			body: JSON.stringify(normalizedDocumentData)
		});
	}

	async updateDocument(slug: string, documentData: UpdateDocumentRequest): Promise<Document> {
		const normalizedDocumentData = {
			...documentData,
			metaData: {
				...documentData.metaData,
				...(documentData.metaData.path && { path: normalizePath(documentData.metaData.path) })
			}
		};

		return this.request<Document>(`/documents/${encodeURIComponent(slug)}`, {
			method: 'PUT',
			body: JSON.stringify(normalizedDocumentData)
		});
	}

	async deleteDocument(path: string): Promise<void> {
		await this.request<void>(`/documents/${this.encodePath(path)}`, {
			method: 'DELETE'
		});
	}

	async getDocumentByPath(path: string): Promise<Document> {
		const encodedPath = this.encodePath(path);
		return this.request<Document>(`/documents${encodedPath}`);
	}

	async updateDocumentByPath(
		path: string,
		documentData: UpdateDocumentRequest,
		saveType: 'manual' | 'auto' = 'manual'
	): Promise<Document> {
		const encodedPath = this.encodePath(path);

		const normalizedDocumentData = {
			...documentData,
			metaData: {
				...documentData.metaData,
				...(documentData.metaData.path && { path: normalizePath(documentData.metaData.path) })
			},
			saveType
		};

		return this.request<Document>(`/documents${encodedPath}`, {
			method: 'PUT',
			body: JSON.stringify(normalizedDocumentData)
		});
	}

	async deleteDocumentByPath(path: string): Promise<void> {
		const encodedPath = this.encodePath(path);
		await this.request<void>(`/documents${encodedPath}`, {
			method: 'DELETE'
		});
	}

	async getFolderTree(): Promise<Folder[]> {
		const response = await this.request<FolderTreeResponse>('/folders');
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
		const encodedPath = this.encodePath(path);
		return this.request<FolderOperationResponse>(`/folders${encodedPath}`, {
			method: 'PUT',
			body: JSON.stringify({ newName })
		});
	}

	async deleteFolder(path: string): Promise<FolderOperationResponse> {
		const encodedPath = this.encodePath(path);
		return this.request<FolderOperationResponse>(`/folders${encodedPath}`, {
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
		const encodedPath = this.encodePath(path);
		const response = await this.request<{ backlinks: Document[]; total: number }>(
			`/links/backlinks${encodedPath}`
		);
		return response.backlinks;
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

		const url = `${this.getApiUrl()}/assets/upload`;

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
			xhr.send(formData);
		});
	}

	async deleteAsset(path: string): Promise<void> {
		const cleanPath = path.startsWith('/') ? path.slice(1) : path;
		await this.request<void>(`/assets/${cleanPath}`, {
			method: 'DELETE'
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

		const apiUrl = this.getApiUrl();

		if (apiUrl === '/api') {
			return uploadsPath;
		}

		const serverRoot = apiUrl.replace('/api', '');
		return `${serverRoot}${uploadsPath}`;
	}

	async exportDocument(path: string): Promise<void> {
		const encodedPath = this.encodePath(path);
		const url = `${this.getApiUrl()}/export/document${encodedPath}`;

		window.open(url, '_blank');
	}

	async exportFolder(path: string): Promise<void> {
		const encodedPath = this.encodePath(path);
		const url = `${this.getApiUrl()}/export/folder${encodedPath}`;

		window.open(url, '_blank');
	}

	async exportAll(): Promise<void> {
		const url = `${this.getApiUrl()}/export/all`;

		window.open(url, '_blank');
	}

	async getGitHubStatus(): Promise<GitHubStatus> {
		return this.request<GitHubStatus>('/github/status');
	}

	async updateGitHubSettings(settings: GitHubConfigRequest): Promise<GitHubStatus> {
		return this.request<GitHubStatus>('/github/config', {
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
}

export const apiClient = new SchістApiClient();

export { SchістApiClient };
