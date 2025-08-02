export interface DocumentMetaData {
	slug?: string;
	title: string;
	path: string;
	created?: string;
	updated?: string;
	tags?: string[];
}

export interface Document {
	metaData: DocumentMetaData;
	content: string;
}

export interface DocumentListResponse {
	documents: Document[];
	total: number;
}

export interface CreateDocumentRequest {
	metaData: Omit<DocumentMetaData, 'slug' | 'created' | 'updated' | 'path'> & { path?: string };
	content: string;
}

export interface CreateDocumentResponse {
	message: string;
	path: string;
}

export interface UpdateDocumentRequest {
	metaData: Omit<DocumentMetaData, 'created' | 'updated'> & { path?: string };
	content: string;
}

export interface SearchResult {
	documents: Document[];
	query: string;
	total: number;
}

export interface TagInfo {
	name: string;
	count: number;
}

export interface TagsResponse {
	tags: TagInfo[];
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

export interface Asset {
	name: string;
	original_name: string;
	path: string;
	size: number;
	content_type: string;
	created: string;
}

export interface AssetUploadResponse {
	message: string;
	asset: Asset;
}

export interface AssetUploadError {
	error: string;
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

export interface Folder {
	name: string;
	path: string;
	created: string;
	document_count: number;
	sub_folders: Folder[];
}

export interface FolderTreeResponse {
	folders: Folder[];
	total: number;
}

export interface MoveDocumentRequest {
	oldPath: string;
	newPath: string;
}

export interface FolderOperationResponse {
	message: string;
	path: string;
}

export interface MoveDocumentResponse {
	message: string;
	oldPath: string;
	newPath: string;
}

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

	if (!path.startsWith('/')) {
		return false;
	}

	if (path.includes('//')) {
		return false;
	}

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

export interface DocumentVersion {
	hash: string;
	message: string;
	author: string;
	timestamp: string;
	file_path: string;
}

export interface VersionsResponse {
	path: string;
	versions: DocumentVersion[];
	total: number;
}

// Version comparison interfaces
export interface DiffLine {
	type: 'addition' | 'deletion' | 'modification' | 'context';
	content: string;
	old_line?: number;
	new_line?: number;
}

export interface DiffSummary {
	additions: number;
	deletions: number;
	modifications: number;
}

export interface DiffResult {
	path: string;
	hash1: string;
	hash2: string;
	lines: DiffLine[];
	summary: DiffSummary;
}

export interface RestoreResponse {
	message: string;
	path: string;
	hash: string;
}

// Import-related types
export interface ImportOptions {
	target_path: string;
	overwrite_mode: 'skip' | 'overwrite' | 'rename';
}

export interface ImportedDocument {
	original_name: string;
	final_path: string;
	title: string;
}

export interface ImportError {
	original_name: string;
	error: string;
}

export interface ImportResult {
	success: ImportedDocument[];
	failed: ImportError[];
	total_files: number;
	imported_count: number;
	failed_count: number;
}

// Export-related types
export type ExportType = 'document' | 'folder' | 'all';

export interface ExportOptions {
	path?: string;
	type: ExportType;
	format?: string; // "zip" or "markdown"
	include_meta?: boolean;
}

export function normalizePath(path: string): string {
	if (!path) {
		return '/';
	}

	if (!path.startsWith('/')) {
		path = '/' + path;
	}

	path = path.replace(/\/+/g, '/');

	if (path.length > 1 && path.endsWith('/')) {
		path = path.slice(0, -1);
	}

	return path;
}
