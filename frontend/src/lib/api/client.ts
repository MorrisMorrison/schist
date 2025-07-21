import { env } from '$env/dynamic/public';
import type {
	Page,
	CreatePageRequest,
	UpdatePageRequest,
	HealthResponse,
	PageListResponse,
	Folder,
	FolderTreeResponse,
	MovePageRequest,
	MovePageResponse,
	FolderOperationResponse,
	CreatePageResponse,
	Asset,
	AssetUploadResponse,
	SearchResult
} from './types.js';
import { normalizePath } from './types.js';

class SchістApiClient {
	private baseUrl: string;

	constructor() {
		this.baseUrl = env.PUBLIC_API_URL || 'http://localhost:8080/api';
	}

	private encodePath(path: string): string {
		const normalizedPath = normalizePath(path);

		// Split path into segments, encode each segment, then rejoin
		// This preserves the forward slashes while encoding special characters in segments
		const segments = normalizedPath.split('/');
		const encodedSegments = segments.map((segment) =>
			segment ? encodeURIComponent(segment) : segment
		);
		return encodedSegments.join('/');
	}

	private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
		const url = `${this.baseUrl}${endpoint}`;

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

	async getPages(): Promise<Page[]> {
		const response = await this.request<PageListResponse>('/pages');
		return response.pages;
	}

	async getPage(slug: string): Promise<Page> {
		return this.request<Page>(`/pages/${encodeURIComponent(slug)}`);
	}

	async createPage(pageData: CreatePageRequest): Promise<CreatePageResponse> {
		const normalizedPageData = {
			...pageData,
			metaData: {
				...pageData.metaData,
				...(pageData.metaData.path && { path: normalizePath(pageData.metaData.path) })
			}
		};

		return this.request<CreatePageResponse>('/pages', {
			method: 'POST',
			body: JSON.stringify(normalizedPageData)
		});
	}

	async updatePage(slug: string, pageData: UpdatePageRequest): Promise<Page> {
		const normalizedPageData = {
			...pageData,
			metaData: {
				...pageData.metaData,
				...(pageData.metaData.path && { path: normalizePath(pageData.metaData.path) })
			}
		};

		return this.request<Page>(`/pages/${encodeURIComponent(slug)}`, {
			method: 'PUT',
			body: JSON.stringify(normalizedPageData)
		});
	}

	async deletePage(path: string): Promise<void> {
		await this.request<void>(`/pages/${this.encodePath(path)}`, {
			method: 'DELETE'
		});
	}

	async getPageByPath(path: string): Promise<Page> {
		const encodedPath = this.encodePath(path);
		return this.request<Page>(`/pages${encodedPath}`);
	}

	async updatePageByPath(path: string, pageData: UpdatePageRequest): Promise<Page> {
		const encodedPath = this.encodePath(path);

		const normalizedPageData = {
			...pageData,
			metaData: {
				...pageData.metaData,
				...(pageData.metaData.path && { path: normalizePath(pageData.metaData.path) })
			}
		};

		return this.request<Page>(`/pages${encodedPath}`, {
			method: 'PUT',
			body: JSON.stringify(normalizedPageData)
		});
	}

	async deletePageByPath(path: string): Promise<void> {
		const encodedPath = this.encodePath(path);
		await this.request<void>(`/pages${encodedPath}`, {
			method: 'DELETE'
		});
	}

	// Folder operations

	async getFolderTree(): Promise<Folder[]> {
		const response = await this.request<FolderTreeResponse>('/folders');
		return response.folders;
	}

	async createFolder(path: string): Promise<FolderOperationResponse> {
		const normalizedPath = normalizePath(path);
		return this.request<FolderOperationResponse>('/folders' + path, {
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

	// Move operations
	async movePage(moveRequest: MovePageRequest): Promise<MovePageResponse> {
		const normalizedRequest = {
			oldPath: normalizePath(moveRequest.oldPath),
			newPath: normalizePath(moveRequest.newPath)
		};
		return this.request<MovePageResponse>('/pages/move', {
			method: 'POST',
			body: JSON.stringify(normalizedRequest)
		});
	}

	// Search
	async searchPages(query: string): Promise<SearchResult> {
		const params = new URLSearchParams({ q: query });
		return this.request<SearchResult>(`/search?${params}`);
	}

	// Asset operations
	async uploadImage(file: File, onProgress?: (progress: number) => void): Promise<Asset> {
		const formData = new FormData();
		formData.append('file', file);

		// For file uploads, we need to handle this differently than JSON requests
		const url = `${this.baseUrl}/assets/upload`;

		return new Promise((resolve, reject) => {
			const xhr = new XMLHttpRequest();

			// Handle progress if callback provided
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
		// Remove leading slash if present since API expects it
		const cleanPath = path.startsWith('/') ? path.slice(1) : path;
		await this.request<void>(`/assets/${cleanPath}`, {
			method: 'DELETE'
		});
	}

	getAssetUrl(path: string): string {
		// Convert /assets/ path to /uploads/ for user-uploaded content
		const uploadsPath = path.replace('/assets/', '/uploads/');
		// Remove /api from base URL to get server root
		const serverRoot = this.baseUrl.replace('/api', '');
		return `${serverRoot}${uploadsPath}`;
	}
}

export const apiClient = new SchістApiClient();

export { SchістApiClient };
