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

/**
 * API helper class for direct backend interactions
 */
export class ApiHelper {
	private apiContext: APIRequestContext;
	private baseURL: string;

	constructor(apiContext: APIRequestContext, baseURL: string = 'http://localhost:8080/api') {
		this.apiContext = apiContext;
		this.baseURL = baseURL;
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
	async uploadAsset(filePath: string, fileName: string = 'test-image.png'): Promise<ApiResponse> {
		try {
			const response = await this.apiContext.post(`${this.baseURL}/assets/upload`, {
				multipart: {
					file: {
						name: fileName,
						mimeType: 'image/png',
						buffer: Buffer.from('fake-image-data') // For testing
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
		try {
			// Get all pages and delete test pages
			const pagesResponse = await this.listPages();
			if (pagesResponse.data && pagesResponse.data.pages) {
				for (const page of pagesResponse.data.pages) {
					if (page.metaData?.title?.includes(prefix) || page.metaData?.path?.includes(prefix)) {
						await this.deletePage(page.metaData.path);
					}
				}
			}

			// Clean up test folders
			const foldersResponse = await this.getFolder('');
			if (foldersResponse.data && foldersResponse.data.folders) {
				for (const folder of foldersResponse.data.folders) {
					if (folder.name?.includes(prefix) || folder.path?.includes(prefix)) {
						await this.deleteFolder(folder.path);
					}
				}
			}
		} catch (error) {
			console.warn('Cleanup failed:', error);
		}
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
		expect(result.data?.metaData?.title).toBe(expectedTitle);
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
			if (!expectedContent || result.data?.content?.includes(expectedContent)) {
				return true;
			}
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}

	return false;
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
