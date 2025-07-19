export interface PageMetaData {
	slug?: string;
	title: string;
	path: string; // NEW: full path from root
	created?: string;
	updated?: string;
	tags?: string[];
}

export interface Page {
	metaData: PageMetaData;
	content: string;
}

export interface PageListResponse {
	pages: Page[];
	total: number;
}

export interface CreatePageRequest {
	metaData: Omit<PageMetaData, 'slug' | 'created' | 'updated' | 'path'> & { path?: string };
	content: string;
}

export interface CreatePageResponse {
	message: string;
	path: string;
}

export interface UpdatePageRequest {
	metaData: Omit<PageMetaData, 'created' | 'updated' > & { path?: string };
	content: string;
}

export interface SearchResult {
	pages: Page[];
	query: string;
	total: number;
}

export interface ApiResponse<T> {
	data?: T;
	error?: string;
	success: boolean;
}

export interface HealthResponse {
	status: string;
	timestamp: string;
}

export class ApiError extends Error {
	constructor(
		message: string,
		public status?: number,
		public response?: Response
	) {
		super(message);
		this.name = 'ApiError';
	}
}

// NEW: Folder interface for nested docs functionality
export interface Folder {
	name: string;
	path: string;
	created: string;
	page_count: number;
	sub_folders: Folder[];
}

// NEW: Response types for folder operations
export interface FolderTreeResponse {
	folders: Folder[];
	total: number;
}

export interface MovePageRequest {
	oldPath: string;
	newPath: string;
}

export interface FolderOperationResponse {
	message: string;
	path: string;
}

export interface MovePageResponse {
	message: string;
	oldPath: string;
	newPath: string;
}

// Helper functions for path operations
export function getParentPath(path: string): string {
	if (!path || path === '/') {
		return '/';
	}
	const segments = path.split('/').filter((segment) => segment !== '');
	if (segments.length <= 1) {
		return '/';
	}
	return '/' + segments.slice(0, -1).join('/');
}

export function getDepth(path: string): number {
	if (!path || path === '/') {
		return 0;
	}
	return path.split('/').filter((segment) => segment !== '').length;
}

export function isValidPath(path: string): boolean {
	if (!path) {
		return false;
	}

	// Must start with '/'
	if (!path.startsWith('/')) {
		return false;
	}

	// Cannot contain consecutive slashes
	if (path.includes('//')) {
		return false;
	}

	// Cannot end with slash unless it's root
	if (path.length > 1 && path.endsWith('/')) {
		return false;
	}

	// Check for invalid characters (basic validation)
	// eslint-disable-next-line no-control-regex
	const invalidChars = /[<>:"|?*\x00-\x1f]/;
	if (invalidChars.test(path)) {
		return false;
	}

	return true;
}

export function normalizePath(path: string): string {
	if (!path) {
		return '/';
	}

	// Ensure starts with '/'
	if (!path.startsWith('/')) {
		path = '/' + path;
	}

	// Remove consecutive slashes
	path = path.replace(/\/+/g, '/');

	// Remove trailing slash unless it's root
	if (path.length > 1 && path.endsWith('/')) {
		path = path.slice(0, -1);
	}

	return path;
}
