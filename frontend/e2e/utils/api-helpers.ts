/**
 * API helper utilities for e2e test setup and cleanup
 */

import { APIRequestContext, expect } from '@playwright/test';
import { TestDocumentData, TestPageData, TestFolderData } from './test-data';

export interface ApiResponse<T = unknown> {
	status: number;
	data?: T;
	error?: string;
}

interface DocumentListData {
	documents: Array<{
		metaData?: {
			title?: string;
			path?: string;
		};
	}>;
}

interface FolderListData {
	folders: Array<{
		name?: string;
		path?: string;
	}>;
}

interface DocumentData {
	metaData?: {
		title?: string;
	};
	content?: string;
}

export class ApiHelper {
	private apiContext: APIRequestContext;
	private baseURL: string;
	private workerIndex: number;

	constructor(apiContext: APIRequestContext, workerIndex?: number, baseURL?: string) {
		this.apiContext = apiContext;
		this.workerIndex = workerIndex ?? 0;
		this.baseURL = baseURL || this.getWorkerSpecificBaseURL(workerIndex);
	}

	private getWorkerSpecificBaseURL(workerIndex?: number): string {
		const index = workerIndex ?? 0;
		const port = 8081 + index;
		return `http://localhost:${port}/api`;
	}

	/**
	 * Health check
	 */
	async healthCheck(): Promise<boolean> {
		try {
			const response = await this.apiContext.get(`${this.baseURL}/health`);
			const data = await response.json();
			return response.ok() && data.status === 'ok';
		} catch {
			return false;
		}
	}

	/**
	 * Create a document via API
	 */
	async createDocument(documentData: TestDocumentData): Promise<ApiResponse> {
		try {
			const response = await this.apiContext.post(`${this.baseURL}/documents`, {
				data: {
					metaData: {
						title: documentData.title,
						path: documentData.path,
						tags: documentData.tags || []
					},
					content: documentData.content
				}
			});

			const data = await response.json();
			const result = {
				status: response.status(),
				data: data
			};

			// Simple wait after document creation to avoid race conditions
			if (response.status() === 201) {
				await new Promise((resolve) => setTimeout(resolve, 300));
			}

			return result;
		} catch (error) {
			return {
				status: 500,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	/**
	 * Get a document by path
	 */
	async getDocument(path: string): Promise<ApiResponse> {
		try {
			const response = await this.apiContext.get(`${this.baseURL}/documents${path}`);

			if (!response.ok()) {
				return { status: response.status(), error: 'Document not found' };
			}

			const data = await response.json();
			return {
				status: response.status(),
				data: data
			};
		} catch (error) {
			return {
				status: 500,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	/**
	 * Update a document via API
	 */
	async updateDocument(
		path: string,
		documentData: Partial<TestDocumentData>
	): Promise<ApiResponse> {
		try {
			const response = await this.apiContext.put(`${this.baseURL}/documents${path}`, {
				data: {
					metaData: {
						title: documentData.title,
						path: documentData.path || path,
						tags: documentData.tags || []
					},
					content: documentData.content
				}
			});

			const data = await response.json();
			return {
				status: response.status(),
				data: data
			};
		} catch (error) {
			return {
				status: 500,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	/**
	 * Delete a document via API
	 */
	async deleteDocument(path: string): Promise<ApiResponse> {
		try {
			const response = await this.apiContext.delete(`${this.baseURL}/documents${path}`);
			const data = await response.json();
			return {
				status: response.status(),
				data: data
			};
		} catch (error) {
			return {
				status: 500,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	/**
	 * List all documents
	 */
	async listDocuments(): Promise<ApiResponse<DocumentListData>> {
		try {
			const response = await this.apiContext.get(`${this.baseURL}/documents`);
			const data = await response.json();
			return {
				status: response.status(),
				data: data
			};
		} catch (error) {
			return {
				status: 500,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	/**
	 * Create a folder via API
	 */
	async createFolder(folderData: TestFolderData): Promise<ApiResponse> {
		try {
			const response = await this.apiContext.post(`${this.baseURL}/folders${folderData.path}`);
			const data = await response.json();
			return {
				status: response.status(),
				data: data
			};
		} catch (error) {
			return {
				status: 500,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	/**
	 * Get folder contents
	 */
	async getFolder(path: string): Promise<ApiResponse<FolderListData>> {
		try {
			const response = await this.apiContext.get(`${this.baseURL}/folders${path}`);
			const data = await response.json();
			return {
				status: response.status(),
				data: data
			};
		} catch (error) {
			return {
				status: 500,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	/**
	 * Delete a folder via API
	 */
	async deleteFolder(path: string): Promise<ApiResponse> {
		try {
			const response = await this.apiContext.delete(`${this.baseURL}/folders${path}`);
			const data = await response.json();
			return {
				status: response.status(),
				data: data
			};
		} catch (error) {
			return {
				status: 500,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	/**
	 * Search for documents
	 */
	async searchDocuments(query: string): Promise<ApiResponse> {
		try {
			const response = await this.apiContext.get(
				`${this.baseURL}/search?q=${encodeURIComponent(query)}`
			);
			const data = await response.json();
			return {
				status: response.status(),
				data: data
			};
		} catch (error) {
			return {
				status: 500,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	/**
	 * Upload an asset
	 */
	async uploadAsset(_filePath: string, fileName: string = 'test-image.png'): Promise<ApiResponse> {
		try {
			const response = await this.apiContext.post(`${this.baseURL}/assets/upload`, {
				multipart: {
					file: {
						name: fileName,
						mimeType: 'image/png',
						buffer: new TextEncoder().encode('fake-image-data') // For testing
					}
				}
			});

			const data = await response.json();
			return {
				status: response.status(),
				data: data
			};
		} catch (error) {
			return {
				status: 500,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	/**
	 * Delete an asset
	 */
	async deleteAsset(assetPath: string): Promise<ApiResponse> {
		try {
			const response = await this.apiContext.delete(`${this.baseURL}/assets${assetPath}`);
			const data = await response.json();
			return {
				status: response.status(),
				data: data
			};
		} catch (error) {
			return {
				status: 500,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	/**
	 * Wait for API to be ready
	 */
	async waitForApiReady(timeoutMs: number = 30000): Promise<boolean> {
		const startTime = Date.now();

		while (Date.now() - startTime < timeoutMs) {
			if (await this.healthCheck()) {
				return true;
			}
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}

		return false;
	}

	async cleanupTestData(): Promise<void> {
		try {
			const documentsResponse = await this.listDocuments();
			const documentData = documentsResponse.data as DocumentListData;

			if (documentData && documentData.documents) {
				for (const document of documentData.documents) {
					const path = document.metaData?.path || '';
					if (path) {
						await this.deleteDocument(path);
					}
				}
			}

			const foldersResponse = await this.getFolder('');
			const folderData = foldersResponse.data as FolderListData;

			if (folderData && folderData.folders) {
				for (const folder of folderData.folders) {
					const path = folder.path || '';
					if (path) {
						await this.deleteFolder(path);
					}
				}
			}
		} catch (error) {
			console.warn('[ApiHelper] Cleanup failed:', error);
		}
	}

	private async waitForDocumentAvailable(path: string, maxAttempts: number = 15): Promise<void> {
		const delay = 150;

		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			try {
				const result = await this.getDocument(path);
				if (result.status === 200) {
					if (attempt > 0) {
						console.log(
							`[ApiHelper] Document ${path} became available after ${attempt + 1} attempts (worker ${this.workerIndex})`
						);
					}
					return;
				}
			} catch (error) {
				// Continue trying
				console.error(error);
			}

			if (attempt < maxAttempts - 1) {
				// Progressive backoff: 150ms, 300ms, 450ms, etc.
				await new Promise((resolve) => setTimeout(resolve, delay * (attempt + 1)));
			}
		}

		console.warn(
			`[ApiHelper] Document ${path} may not be fully available after ${maxAttempts} attempts (worker ${this.workerIndex})`
		);
	}

	/**
	 * Legacy aliases for backwards compatibility
	 */
	async createPage(pageData: TestPageData): Promise<ApiResponse> {
		return this.createDocument(pageData);
	}

	async getPage(path: string): Promise<ApiResponse> {
		return this.getDocument(path);
	}

	async updatePage(path: string, pageData: Partial<TestPageData>): Promise<ApiResponse> {
		return this.updateDocument(path, pageData);
	}

	async deletePage(path: string): Promise<ApiResponse> {
		return this.deleteDocument(path);
	}

	async listPages(): Promise<ApiResponse<DocumentListData>> {
		return this.listDocuments();
	}

	async searchPages(query: string): Promise<ApiResponse> {
		return this.searchDocuments(query);
	}

	/**
	 * Authentication methods
	 */

	/**
	 * Get application configuration (including auth status)
	 */
	async getConfig(): Promise<{ auth_enabled: boolean }> {
		try {
			const response = await this.apiContext.get(`${this.baseURL}/config`);

			if (!response.ok()) {
				throw new Error(`Config request failed: ${response.status()}`);
			}

			const data = await response.json();
			return data as { auth_enabled: boolean };
		} catch (error) {
			throw new Error(
				`Failed to get config: ${error instanceof Error ? error.message : 'Unknown error'}`
			);
		}
	}

	/**
	 * Make a direct API request (useful for testing auth)
	 */
	async request(method: string, endpoint: string, data?: any): Promise<ApiResponse> {
		try {
			const url = endpoint.startsWith('/')
				? `${this.baseURL}${endpoint}`
				: `${this.baseURL}/${endpoint}`;

			let response;
			switch (method.toUpperCase()) {
				case 'GET':
					response = await this.apiContext.get(url);
					break;
				case 'POST':
					response = await this.apiContext.post(url, { data });
					break;
				case 'PUT':
					response = await this.apiContext.put(url, { data });
					break;
				case 'DELETE':
					response = await this.apiContext.delete(url);
					break;
				default:
					throw new Error(`Unsupported method: ${method}`);
			}

			let responseData;
			try {
				responseData = await response.json();
			} catch {
				responseData = null;
			}

			return {
				status: response.status(),
				data: responseData
			};
		} catch (error) {
			return {
				status: 500,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	/**
	 * Login with username and password (when auth is enabled)
	 */
	async login(username: string, password: string): Promise<ApiResponse> {
		return this.request('POST', '/auth/login', { username, password });
	}

	/**
	 * Logout (when auth is enabled)
	 */
	async logout(): Promise<ApiResponse> {
		return this.request('POST', '/auth/logout');
	}

	/**
	 * Get current user info (when auth is enabled)
	 */
	async getCurrentUser(): Promise<ApiResponse> {
		return this.request('GET', '/auth/me');
	}
}

export async function createTestDocuments(
	apiHelper: ApiHelper,
	documents: TestDocumentData[]
): Promise<void> {
	for (const documentData of documents) {
		const result = await apiHelper.createDocument(documentData);
		expect(result.status).toBe(201);
	}
}

export async function createTestFolders(
	apiHelper: ApiHelper,
	folders: TestFolderData[]
): Promise<void> {
	for (const folderData of folders) {
		const result = await apiHelper.createFolder(folderData);
		expect(result.status).toBe(201);
	}
}

/**
 * Verify document exists via API
 */
export async function verifyDocumentExists(
	apiHelper: ApiHelper,
	path: string,
	expectedTitle?: string
): Promise<void> {
	const result = await apiHelper.getDocument(path);
	expect(result.status).toBe(200);

	if (expectedTitle) {
		const documentData = result.data as DocumentData;
		expect(documentData?.metaData?.title).toBe(expectedTitle);
	}
}

/**
 * Verify folder exists via API
 */
export async function verifyFolderExists(apiHelper: ApiHelper, path: string): Promise<void> {
	const result = await apiHelper.getFolder(path);
	expect(result.status).toBe(200);
}

/**
 * Wait for document to be created/updated
 */
export async function waitForDocumentUpdate(
	apiHelper: ApiHelper,
	path: string,
	expectedContent?: string,
	timeoutMs: number = 10000
): Promise<boolean> {
	const startTime = Date.now();

	while (Date.now() - startTime < timeoutMs) {
		const result = await apiHelper.getDocument(path);
		if (result.status === 200) {
			const documentData = result.data as DocumentData;
			if (!expectedContent || documentData?.content?.includes(expectedContent)) {
				return true;
			}
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}

	return false;
}

/**
 * Get the worker-specific API base URL for direct page.request calls
 */
export function getWorkerApiURL(workerIndex?: number): string {
	const index = workerIndex ?? 0;
	const port = 8081 + index;
	return `http://localhost:${port}/api`;
}

/**
 * Get the worker-specific base URL (without /api) for direct requests
 */
export function getWorkerBaseURL(workerIndex?: number): string {
	const index = workerIndex ?? 0;
	const port = 8081 + index;
	return `http://localhost:${port}`;
}

// Legacy export functions for backwards compatibility
export const createTestPages = createTestDocuments;
export const verifyPageExists = verifyDocumentExists;
export const waitForPageUpdate = waitForDocumentUpdate;

/**
 * Mock API responses for testing error scenarios
 */
export class MockApiHelper extends ApiHelper {
	private shouldFail = false;
	private failureStatus = 500;
	private failureMessage = 'Mock API failure';

	setFailure(shouldFail: boolean, status: number = 500, message: string = 'Mock API failure') {
		this.shouldFail = shouldFail;
		this.failureStatus = status;
		this.failureMessage = message;
	}

	async createDocument(): Promise<ApiResponse> {
		if (this.shouldFail) {
			return { status: this.failureStatus, error: this.failureMessage };
		}
		return super.createDocument({} as TestDocumentData);
	}

	async getDocument(): Promise<ApiResponse> {
		if (this.shouldFail) {
			return { status: this.failureStatus, error: this.failureMessage };
		}
		return { status: 200, data: {} };
	}

	// Legacy aliases for backwards compatibility
	async createPage(pageData?: TestPageData): Promise<ApiResponse> {
		return this.createDocument(pageData);
	}

	async getPage(path?: string): Promise<ApiResponse> {
		return this.getDocument(path);
	}
}
