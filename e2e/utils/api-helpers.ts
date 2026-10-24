import { APIRequestContext, expect } from '@playwright/test';
import { BASE_URL } from './routes';
import { TestDocumentData } from './test-data';

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

const DEFAULT_API_URL = `${BASE_URL}/api`;

export class ApiHelper {
	private apiContext: APIRequestContext;
	private baseURL: string;
	private authToken?: string;

	constructor(apiContext: APIRequestContext, baseURL: string = DEFAULT_API_URL) {
		this.apiContext = apiContext;
		this.baseURL = baseURL;
	}

	setAuthToken(token: string) {
		this.authToken = token;
	}

	private getAuthHeaders(): { [key: string]: string } {
		return this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {};
	}

	/**
	 * Generic request helper. All other methods delegate to this so the
	 * URL/header/JSON/error handling lives in exactly one place.
	 */
	async request(
		method: string,
		endpoint: string,
		data?: Record<string, unknown>
	): Promise<ApiResponse> {
		try {
			const url = endpoint.startsWith('/')
				? `${this.baseURL}${endpoint}`
				: `${this.baseURL}/${endpoint}`;

			const headers = this.getAuthHeaders();
			let response: Awaited<ReturnType<APIRequestContext['get']>>;
			switch (method.toUpperCase()) {
				case 'GET':
					response = await this.apiContext.get(url, { headers });
					break;
				case 'POST':
					response = await this.apiContext.post(url, { data, headers });
					break;
				case 'PUT':
					response = await this.apiContext.put(url, { data, headers });
					break;
				case 'DELETE':
					response = await this.apiContext.delete(url, { headers });
					break;
				default:
					throw new Error(`Unsupported method: ${method}`);
			}

			let responseData: unknown;
			try {
				responseData = await response.json();
			} catch {
				responseData = null;
			}

			return { status: response.status(), data: responseData };
		} catch (error) {
			return {
				status: 500,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	async healthCheck(): Promise<boolean> {
		const response = await this.request('GET', '/health');
		return response.status === 200 && (response.data as { status?: string })?.status === 'ok';
	}

	async getConfig(): Promise<{ auth_enabled: boolean }> {
		const response = await this.request('GET', '/config');
		if (response.status !== 200) {
			throw new Error(`Failed to get config: ${response.error ?? `status ${response.status}`}`);
		}
		return response.data as { auth_enabled: boolean };
	}

	async waitForApiReady(timeoutMs: number = 30000): Promise<boolean> {
		const startTime = Date.now();
		let retryInterval = 1000; // Start with 1 second

		while (Date.now() - startTime < timeoutMs) {
			const [healthOk, configResponse] = await Promise.all([
				this.healthCheck(),
				this.request('GET', '/config')
			]);

			if (healthOk && configResponse.status === 200) {
				// Extra delay to ensure full initialization before tests start
				await new Promise((resolve) => setTimeout(resolve, 1000));
				return true;
			}

			console.log(
				`[API Ready] Waiting for server... (${Math.round((Date.now() - startTime) / 1000)}s)`
			);
			await new Promise((resolve) => setTimeout(resolve, retryInterval));
			// Exponential backoff up to 3 seconds
			retryInterval = Math.min(retryInterval * 1.2, 3000);
		}

		return false;
	}

	// New passkey-based authentication setup check (used by auth.setup.ts)
	async checkSetupRequired(): Promise<ApiResponse<{ requires_setup: boolean }>> {
		return this.request('GET', '/auth/setup/required') as Promise<
			ApiResponse<{ requires_setup: boolean }>
		>;
	}

	// Documents
	async createDocument(documentData: TestDocumentData): Promise<ApiResponse> {
		const response = await this.request('POST', '/documents', {
			metaData: {
				title: documentData.title,
				path: documentData.path,
				tags: documentData.tags || []
			},
			content: documentData.content
		});

		// Wait for read-after-write consistency before returning: the git-backed
		// store commits the document slightly after the 201, so a test that
		// navigates immediately can fetch it before it is queryable -- the page
		// then renders not-found and the load assertion times out (a flaky
		// `document-title` not-visible failure). Confirm it is retrievable first.
		if (response.status === 201 && documentData.path) {
			await this.waitForDocumentReadable(documentData.path);
		}

		return response;
	}

	/**
	 * Poll until a freshly created document is retrievable (GET returns 200),
	 * so callers can navigate to it without racing the backend's write.
	 */
	async waitForDocumentReadable(path: string, timeoutMs: number = 10000): Promise<void> {
		const start = Date.now();
		while (Date.now() - start < timeoutMs) {
			const res = await this.request('GET', `/documents${path}`);
			if (res.status === 200) {
				return;
			}
			await new Promise((resolve) => setTimeout(resolve, 150));
		}
		console.warn(`[ApiHelper] Document ${path} not retrievable after ${timeoutMs}ms`);
	}

	async deleteDocument(path: string): Promise<ApiResponse> {
		return this.request('DELETE', `/documents${path}`);
	}

	async listDocuments(): Promise<ApiResponse<DocumentListData>> {
		return this.request('GET', '/documents') as Promise<ApiResponse<DocumentListData>>;
	}

	// Folders
	async getFolder(path: string): Promise<ApiResponse<FolderListData>> {
		return this.request('GET', `/folders${path}`) as Promise<ApiResponse<FolderListData>>;
	}

	async deleteFolder(path: string): Promise<ApiResponse> {
		return this.request('DELETE', `/folders${path}`);
	}

	// Shares
	async listShares(): Promise<ApiResponse> {
		return this.request('GET', '/shares');
	}

	async revokeShare(shareId: string): Promise<ApiResponse> {
		return this.request('DELETE', `/shares/${shareId}`);
	}

	async cleanupUserShares(): Promise<void> {
		try {
			const sharesResponse = await this.listShares();
			const sharesData = sharesResponse.data as { shares?: Array<{ id: string }> } | undefined;
			for (const share of sharesData?.shares ?? []) {
				await this.revokeShare(share.id);
			}
		} catch (error) {
			console.warn('Failed to cleanup user shares:', error);
		}
	}

	async cleanupTestData(): Promise<void> {
		try {
			// Cleanup shares first (before deleting documents they reference)
			await this.cleanupUserShares();

			const documentsResponse = await this.listDocuments();
			for (const document of documentsResponse.data?.documents ?? []) {
				const path = document.metaData?.path;
				if (path) {
					await this.deleteDocument(path);
				}
			}

			const foldersResponse = await this.getFolder('');
			for (const folder of foldersResponse.data?.folders ?? []) {
				if (folder.path) {
					await this.deleteFolder(folder.path);
				}
			}
		} catch (error) {
			console.warn('[ApiHelper] Cleanup failed:', error);
		}
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
