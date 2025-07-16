export interface Page {
	slug: string;
	title: string;
	content: string;
	created?: string;
	updated?: string;
	tags?: string[];
}

export interface PageMetaData {
	slug: string;
	title: string;
	created: string;
	updated: string;
	tags?: string[];
}

export interface PagesResponse {
	pages: PageMetaData[];
	total: number;
}

export interface PageResponse {
	slug: string;
	title: string;
	content: string;
}

export interface CreatePageRequest {
	title: string;
	content: string;
}

export interface UpdatePageRequest {
	title: string;
	content: string;
}

export interface ApiResponse {
	message: string;
	slug?: string;
}

export interface SearchResponse {
	query: string;
	results: PageMetaData[];
	total: number;
}

export interface HealthResponse {
	status: string;
	service: string;
}
