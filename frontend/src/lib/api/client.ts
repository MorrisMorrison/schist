import { PUBLIC_API_URL } from '$env/static/public';
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
	FolderOperationResponse
} from './types.js';
import { normalizePath } from './types.js';

class SchістApiClient {
	private baseUrl: string;

	constructor() {
		this.baseUrl = PUBLIC_API_URL || 'http://localhost:8080/api';
	}

	private encodePath(path: string): string {
		// Normalize the path first
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

			// Handle empty responses (like DELETE)
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

	// Health check
	async health(): Promise<HealthResponse> {
		return this.request<HealthResponse>('/health');
	}

	// Page operations
	async getPages(): Promise<Page[]> {
		const response = await this.request<PageListResponse>('/pages');
		return response.pages;
	}

	async getPage(slug: string): Promise<Page> {
		return this.request<Page>(`/pages/${encodeURIComponent(slug)}`);
	}

	async createPage(pageData: CreatePageRequest): Promise<Page> {
		// Ensure path is normalized if provided
		const normalizedPageData = {
			...pageData,
			metaData: {
				...pageData.metaData,
				...(pageData.metaData.path && { path: normalizePath(pageData.metaData.path) })
			}
		};

		return this.request<Page>('/pages', {
			method: 'POST',
			body: JSON.stringify(normalizedPageData)
		});
	}

	async updatePage(slug: string, pageData: UpdatePageRequest): Promise<Page> {
		// Ensure path is normalized if provided
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

	async deletePage(slug: string): Promise<void> {
		await this.request<void>(`/pages/${encodeURIComponent(slug)}`, {
			method: 'DELETE'
		});
	}

	// Path-based page operations
	async getPageByPath(path: string): Promise<Page> {
		const encodedPath = this.encodePath(path);
		return this.request<Page>(`/pages${encodedPath}`);
	}

	async updatePageByPath(path: string, pageData: UpdatePageRequest): Promise<Page> {
		const encodedPath = this.encodePath(path);

		// Ensure path is normalized if provided in pageData
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
		return this.request<FolderOperationResponse>('/folders', {
			method: 'POST',
			body: JSON.stringify({ path: normalizedPath })
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
	async searchPages(query: string): Promise<Page[]> {
		const params = new URLSearchParams({ q: query });
		return this.request<Page[]>(`/search?${params}`);
	}
}

// Singleton instance
export const apiClient = new SchістApiClient();

// Export class for testing
export { SchістApiClient };
