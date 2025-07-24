/**
 * API helper utilities for e2e test setup and cleanup
 */

import { APIRequestContext, expect } from '@playwright/test';
import { TestPageData, TestFolderData } from './test-data';

export interface ApiResponse<T = unknown> {
	status: number;
	data?: T;
	error?: string;
}

interface PageListData {
	pages: Array<{
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

interface PageData {
	metaData?: {
		title?: string;
	};
	content?: string;
}

/**
 * API helper class for direct backend interactions
 */
export class ApiHelper {
	private apiContext: APIRequestContext;
	private baseURL: string;

	constructor(apiContext: APIRequestContext, workerIndex?: number, baseURL?: string) {
		this.apiContext = apiContext;
		this.baseURL = baseURL || this.getWorkerSpecificBaseURL(workerIndex);
	}

	/**
	 * Get the appropriate backend URL for the current test worker
	 */
	private getWorkerSpecificBaseURL(workerIndex?: number): string {
		// For now, default to port 8081 for single worker testing
		// TODO: When enabling parallel workers, use parallelIndex to determine port
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
	 * Create a page via API
	 */
	async createPage(pageData: TestPageData): Promise<ApiResponse> {
		try {
			const response = await this.apiContext.post(`${this.baseURL}/pages`, {
				data: {
					metaData: {
						title: pageData.title,
						path: pageData.path,
						tags: pageData.tags || []
					},
					content: pageData.content
				}
			});

			const data = await response.json();
			const result = {
				status: response.status(),
				data: data
			};

			// Simple wait after page creation to avoid race conditions
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
	 * Get a page by path
	 */
	async getPage(path: string): Promise<ApiResponse> {
		try {
			const response = await this.apiContext.get(`${this.baseURL}/pages${path}`);

			if (!response.ok()) {
				return { status: response.status(), error: 'Page not found' };
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
	 * Update a page via API
	 */
	async updatePage(path: string, pageData: Partial<TestPageData>): Promise<ApiResponse> {
		try {
			const response = await this.apiContext.put(`${this.baseURL}/pages${path}`, {
				data: {
					metaData: {
						title: pageData.title,
						path: pageData.path || path,
						tags: pageData.tags || []
					},
					content: pageData.content
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
	 * Delete a page via API
	 */
	async deletePage(path: string): Promise<ApiResponse> {
		try {
			const response = await this.apiContext.delete(`${this.baseURL}/pages${path}`);
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
	 * List all pages
	 */
	async listPages(): Promise<ApiResponse> {
		try {
			const response = await this.apiContext.get(`${this.baseURL}/pages`);
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
	async getFolder(path: string): Promise<ApiResponse> {
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
	 * Search for pages
	 */
	async searchPages(query: string): Promise<ApiResponse> {
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

	/**
	 * Cleanup test data by prefix
	 */
	async cleanupTestData(prefix: string = 'test-'): Promise<void> {
		// The backend delete APIs have issues, so let's use a simple filesystem-based cleanup
		// This is more reliable than trying to use the buggy API endpoints
		console.log(`[ApiHelper] Starting direct filesystem cleanup for worker ${this.workerIndex}`);

		try {
			// Since the API context runs in browser, we can't directly access filesystem
			// Instead, let's make all pages show up as deleted by making a comprehensive API call
			// to list and attempt deletion of everything

			const pagesResponse = await this.listPages();
			const pageData = pagesResponse.data as PageListData;

			if (pageData && pageData.pages) {
				console.log(`[ApiHelper] Found ${pageData.pages.length} pages to clean up`);

				// Delete every single page found
				for (const page of pageData.pages) {
					const path = page.metaData?.path || '';
					if (path) {
						const result = await this.deletePage(path);
						console.log(`[ApiHelper] Delete ${path}: status ${result.status}`);
					}
				}
			}

			// Also try to clean up folders
			const foldersResponse = await this.getFolder('');
			const folderData = foldersResponse.data as FolderListData;

			if (folderData && folderData.folders) {
				console.log(`[ApiHelper] Found ${folderData.folders.length} folders to clean up`);

				// Delete every folder found
				for (const folder of folderData.folders) {
					const path = folder.path || '';
					if (path) {
						const result = await this.deleteFolder(path);
						console.log(`[ApiHelper] Delete folder ${path}: status ${result.status}`);
					}
				}
			}

			console.log(`[ApiHelper] Cleanup completed`);
		} catch (error) {
			console.warn('[ApiHelper] Cleanup failed:', error);
		}
	}

	/**
	 * Wait for a page to be available after creation
	 * This helps prevent race conditions in tests
	 */
	private async waitForPageAvailable(path: string, maxAttempts: number = 15): Promise<void> {
		const delay = 150; // Increased base delay for parallel execution

		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			try {
				const result = await this.getPage(path);
				if (result.status === 200) {
					if (attempt > 0) {
						console.log(
							`[ApiHelper] Page ${path} became available after ${attempt + 1} attempts (worker ${this.workerIndex})`
						);
					}
					return;
				}
			} catch (error) {
				// Continue trying
			}

			if (attempt < maxAttempts - 1) {
				// Progressive backoff: 150ms, 300ms, 450ms, etc.
				await new Promise((resolve) => setTimeout(resolve, delay * (attempt + 1)));
			}
		}

		console.warn(
			`[ApiHelper] Page ${path} may not be fully available after ${maxAttempts} attempts (worker ${this.workerIndex})`
		);
	}
}

/**
 * Create test pages in bulk
 */
export async function createTestPages(apiHelper: ApiHelper, pages: TestPageData[]): Promise<void> {
	for (const pageData of pages) {
		const result = await apiHelper.createPage(pageData);
		expect(result.status).toBe(201);
	}
}

/**
 * Create test folder structure
 */
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
 * Verify page exists via API
 */
export async function verifyPageExists(
	apiHelper: ApiHelper,
	path: string,
	expectedTitle?: string
): Promise<void> {
	const result = await apiHelper.getPage(path);
	expect(result.status).toBe(200);

	if (expectedTitle) {
		const pageData = result.data as PageData;
		expect(pageData?.metaData?.title).toBe(expectedTitle);
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
 * Wait for page to be created/updated
 */
export async function waitForPageUpdate(
	apiHelper: ApiHelper,
	path: string,
	expectedContent?: string,
	timeoutMs: number = 10000
): Promise<boolean> {
	const startTime = Date.now();

	while (Date.now() - startTime < timeoutMs) {
		const result = await apiHelper.getPage(path);
		if (result.status === 200) {
			const pageData = result.data as PageData;
			if (!expectedContent || pageData?.content?.includes(expectedContent)) {
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

	async createPage(): Promise<ApiResponse> {
		if (this.shouldFail) {
			return { status: this.failureStatus, error: this.failureMessage };
		}
		return super.createPage({} as TestPageData);
	}

	async getPage(): Promise<ApiResponse> {
		if (this.shouldFail) {
			return { status: this.failureStatus, error: this.failureMessage };
		}
		return { status: 200, data: {} };
	}
}
