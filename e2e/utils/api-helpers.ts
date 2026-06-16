import { APIRequestContext, expect } from '@playwright/test';
import { TestDocumentData, TestFolderData } from './test-data';

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

interface PasskeyOptions {
	publicKey: {
		challenge: string;
		rp: { id: string; name: string };
		user: { id: string; name: string; displayName: string };
		pubKeyCredParams: Array<{ type: string; alg: number }>;
		timeout?: number;
		excludeCredentials?: Array<{ id: string; type: string }>;
		authenticatorSelection?: {
			authenticatorAttachment?: string;
			userVerification?: string;
		};
	};
}

interface WebAuthnCredentialResponse {
	id: string;
	rawId: string;
	response: {
		clientDataJSON: string;
		attestationObject?: string;
		authenticatorData?: string;
		signature?: string;
		userHandle?: string;
	};
	type: string;
	authenticatorAttachment?: string;
}

interface PasskeyRegistrationData extends Record<string, unknown> {
	name: string;
}

interface PasskeyRegistrationResponse {
	sessionId: string;
	options: PasskeyOptions;
}

interface PasskeyRegistrationFinishData extends Record<string, unknown> {
	name: string;
	sessionId: string;
	response: WebAuthnCredentialResponse;
}

interface PasskeyAuthenticationResponse {
	sessionId: string;
	options: PasskeyOptions;
}

interface PasskeyAuthenticationFinishData extends Record<string, unknown> {
	sessionId: string;
	response: WebAuthnCredentialResponse;
}

interface UserData {
	id: string;
	username: string;
	is_admin: boolean;
	created_at: string;
	last_login?: string;
	passkey_ids: string[];
}

interface UsersListResponse {
	users: UserData[];
}

interface FolderListData {
	folders: Array<{
		name?: string;
		path?: string;
	}>;
}

const DEFAULT_API_URL = `${process.env?.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'}/api`;

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

	async healthCheck(): Promise<boolean> {
		try {
			const response = await this.apiContext.get(`${this.baseURL}/health`);
			const data = await response.json();
			return response.ok() && data.status === 'ok';
		} catch {
			return false;
		}
	}

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
				},
				headers: this.getAuthHeaders()
			});

			const data = await response.json();
			const result = {
				status: response.status(),
				data: data
			};

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

	async getDocument(path: string): Promise<ApiResponse> {
		try {
			const response = await this.apiContext.get(`${this.baseURL}/documents${path}`, {
				headers: this.getAuthHeaders()
			});

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
				},
				headers: this.getAuthHeaders()
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

	async deleteDocument(path: string): Promise<ApiResponse> {
		try {
			const response = await this.apiContext.delete(`${this.baseURL}/documents${path}`, {
				headers: this.getAuthHeaders()
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

	async listDocuments(): Promise<ApiResponse<DocumentListData>> {
		try {
			const response = await this.apiContext.get(`${this.baseURL}/documents`, {
				headers: this.getAuthHeaders()
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
	 * Share API methods
	 */

	async createShare(documentPath: string, expiryDays: number = 7): Promise<ApiResponse> {
		try {
			const response = await this.apiContext.post(`${this.baseURL}/shares`, {
				headers: {
					...this.getAuthHeaders(),
					'Content-Type': 'application/json'
				},
				data: {
					document_path: documentPath,
					expiry_days: expiryDays
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

	async listShares(): Promise<ApiResponse> {
		try {
			const response = await this.apiContext.get(`${this.baseURL}/shares`, {
				headers: this.getAuthHeaders()
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

	async getSharedDocument(token: string): Promise<ApiResponse> {
		try {
			// This endpoint doesn't require authentication
			const response = await this.apiContext.get(`${this.baseURL}/shares/${token}`);
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

	async revokeShare(shareId: string): Promise<ApiResponse> {
		try {
			const response = await this.apiContext.delete(`${this.baseURL}/shares/${shareId}`, {
				headers: this.getAuthHeaders()
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

	async cleanupExpiredShares(): Promise<ApiResponse> {
		try {
			const response = await this.apiContext.post(`${this.baseURL}/shares/cleanup`, {
				headers: this.getAuthHeaders()
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
	 * Cleanup all shares for the authenticated user
	 */
	async cleanupUserShares(): Promise<void> {
		try {
			const sharesResponse = await this.listShares();
			if (sharesResponse.status === 200 && sharesResponse.data) {
				const sharesData = sharesResponse.data as { shares: Array<{ id: string }> };
				if (sharesData.shares) {
					for (const share of sharesData.shares) {
						await this.revokeShare(share.id);
					}
				}
			}
		} catch (error) {
			console.warn('Failed to cleanup user shares:', error);
		}
	}

	async createFolder(folderData: TestFolderData): Promise<ApiResponse> {
		try {
			const response = await this.apiContext.post(`${this.baseURL}/folders${folderData.path}`, {
				headers: this.getAuthHeaders()
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

	async getFolder(path: string): Promise<ApiResponse<FolderListData>> {
		try {
			const response = await this.apiContext.get(`${this.baseURL}/folders${path}`, {
				headers: this.getAuthHeaders()
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

	async deleteFolder(path: string): Promise<ApiResponse> {
		try {
			const response = await this.apiContext.delete(`${this.baseURL}/folders${path}`, {
				headers: this.getAuthHeaders()
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

	async searchDocuments(query: string): Promise<ApiResponse> {
		try {
			const response = await this.apiContext.get(
				`${this.baseURL}/search?q=${encodeURIComponent(query)}`,
				{
					headers: this.getAuthHeaders()
				}
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

	async uploadAsset(_filePath: string, fileName: string = 'test-image.png'): Promise<ApiResponse> {
		try {
			const response = await this.apiContext.post(`${this.baseURL}/assets/upload`, {
				multipart: {
					file: {
						name: fileName,
						mimeType: 'image/png',
						buffer: new TextEncoder().encode('fake-image-data') // For testing
					}
				},
				headers: this.getAuthHeaders()
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

	async deleteAsset(assetPath: string): Promise<ApiResponse> {
		try {
			const response = await this.apiContext.delete(`${this.baseURL}/assets${assetPath}`, {
				headers: this.getAuthHeaders()
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

	async waitForApiReady(timeoutMs: number = 30000): Promise<boolean> {
		const startTime = Date.now();
		let retryInterval = 1000; // Start with 1 second

		while (Date.now() - startTime < timeoutMs) {
			try {
				// Check both health and config endpoints to ensure full readiness
				const [healthOk, configResponse] = await Promise.all([
					this.healthCheck(),
					this.request('GET', '/config')
				]);

				if (healthOk && configResponse.status === 200) {
					// Add extra delay to ensure full initialization
					await new Promise((resolve) => setTimeout(resolve, 1000));
					return true;
				}
			} catch (_error) {
				console.log(
					`[API Ready] Waiting for server... (${Math.round((Date.now() - startTime) / 1000)}s)`
				);
			}

			await new Promise((resolve) => setTimeout(resolve, retryInterval));
			// Exponential backoff up to 3 seconds
			retryInterval = Math.min(retryInterval * 1.2, 3000);
		}

		return false;
	}

	async cleanupTestData(): Promise<void> {
		try {
			// Cleanup shares first (before deleting documents they reference)
			await this.cleanupUserShares();

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

	async request(
		method: string,
		endpoint: string,
		data?: Record<string, unknown>
	): Promise<ApiResponse> {
		try {
			const url = endpoint.startsWith('/')
				? `${this.baseURL}${endpoint}`
				: `${this.baseURL}/${endpoint}`;

			let response: Awaited<ReturnType<APIRequestContext['get']>>;
			const headers = this.getAuthHeaders();
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

	// Legacy password-based login (for backward compatibility during migration)
	async login(username: string, password: string): Promise<ApiResponse> {
		return this.request('POST', '/auth/login', { username, password });
	}

	async logout(): Promise<ApiResponse> {
		return this.request('POST', '/auth/logout');
	}

	async getCurrentUser(): Promise<ApiResponse> {
		return this.request('GET', '/auth/me');
	}

	// New passkey-based authentication methods
	async checkSetupRequired(): Promise<ApiResponse<{ requires_setup: boolean }>> {
		return this.request('GET', '/auth/setup/required') as Promise<
			ApiResponse<{ requires_setup: boolean }>
		>;
	}

	async createFirstUser(userData: {
		username: string;
		credential_id: string;
	}): Promise<ApiResponse> {
		return this.request('POST', '/auth/setup/first-user', userData);
	}

	async createUserFromInvite(inviteData: {
		token: string;
		username: string;
		credential_id: string;
	}): Promise<ApiResponse> {
		return this.request('POST', '/auth/setup/invite-user', inviteData);
	}

	async generateInviteToken(): Promise<ApiResponse<{ invite_url: string; token: string }>> {
		return this.request('POST', '/auth/invite') as Promise<
			ApiResponse<{ invite_url: string; token: string }>
		>;
	}

	async beginPasskeyRegistration(
		data: PasskeyRegistrationData
	): Promise<ApiResponse<PasskeyRegistrationResponse>> {
		return this.request('POST', '/passkeys/register/begin', data) as Promise<
			ApiResponse<PasskeyRegistrationResponse>
		>;
	}

	async finishPasskeyRegistration(
		data: PasskeyRegistrationFinishData
	): Promise<ApiResponse<{ credentialId: string }>> {
		return this.request('POST', '/passkeys/register/finish', data) as Promise<
			ApiResponse<{ credentialId: string }>
		>;
	}

	async beginPasskeyAuthentication(): Promise<ApiResponse<PasskeyAuthenticationResponse>> {
		return this.request('POST', '/passkeys/authenticate/begin') as Promise<
			ApiResponse<PasskeyAuthenticationResponse>
		>;
	}

	async finishPasskeyAuthentication(
		data: PasskeyAuthenticationFinishData
	): Promise<ApiResponse<{ credentialId: string }>> {
		return this.request('POST', '/passkeys/authenticate/finish', data) as Promise<
			ApiResponse<{ credentialId: string }>
		>;
	}

	async listUsers(): Promise<ApiResponse<UsersListResponse>> {
		return this.request('GET', '/users') as Promise<ApiResponse<UsersListResponse>>;
	}

	async deleteUser(username: string): Promise<ApiResponse> {
		return this.request('DELETE', `/users/${username}`);
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

