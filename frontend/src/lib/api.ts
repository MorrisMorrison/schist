import type {
	PagesResponse,
	PageResponse,
	CreatePageRequest,
	UpdatePageRequest,
	ApiResponse,
	SearchResponse,
	HealthResponse
} from './types.js';

const API_BASE = '/api';

class ApiError extends Error {
	constructor(
		message: string,
		public status: number,
		public response?: Response
	) {
		super(message);
		this.name = 'ApiError';
	}
}

async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
	const url = `${API_BASE}${endpoint}`;

	const response = await fetch(url, {
		headers: {
			'Content-Type': 'application/json',
			...options.headers
		},
		...options
	});

	if (!response.ok) {
		throw new ApiError(
			`API request failed: ${response.status} ${response.statusText}`,
			response.status,
			response
		);
	}

	return response.json();
}

export const api = {
	// Health check
	async health(): Promise<HealthResponse> {
		return apiRequest<HealthResponse>('/health');
	},

	// Pages
	async getPages(): Promise<PagesResponse> {
		return apiRequest<PagesResponse>('/pages');
	},

	async getPage(slug: string): Promise<PageResponse> {
		return apiRequest<PageResponse>(`/pages/${encodeURIComponent(slug)}`);
	},

	async createPage(data: CreatePageRequest): Promise<ApiResponse> {
		return apiRequest<ApiResponse>('/pages', {
			method: 'POST',
			body: JSON.stringify(data)
		});
	},

	async updatePage(slug: string, data: UpdatePageRequest): Promise<ApiResponse> {
		return apiRequest<ApiResponse>(`/pages/${encodeURIComponent(slug)}`, {
			method: 'PUT',
			body: JSON.stringify(data)
		});
	},

	async deletePage(slug: string): Promise<ApiResponse> {
		return apiRequest<ApiResponse>(`/pages/${encodeURIComponent(slug)}`, {
			method: 'DELETE'
		});
	},

	// Search
	async search(query: string): Promise<SearchResponse> {
		const params = new URLSearchParams({ q: query });
		return apiRequest<SearchResponse>(`/search?${params}`);
	}
};

export { ApiError };
