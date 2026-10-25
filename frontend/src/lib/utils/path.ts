/**
 * Unified path handling utilities for consistent path operations
 * across the frontend application.
 */

/**
 * Normalizes a path by ensuring it starts with '/', removing double slashes,
 * and removing trailing slashes (except for root).
 */
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

/**
 * Encodes a path by normalizing it and then URI-encoding each segment.
 * This ensures paths are safe to use in URLs while maintaining proper structure.
 */
export function encodePath(path: string): string {
	const normalized = normalizePath(path);

	if (normalized === '/') {
		return '/';
	}

	return normalized
		.split('/')
		.map((segment, index) => {
			// Skip empty first segment from leading slash
			if (index === 0 && segment === '') {
				return '';
			}
			return encodeURIComponent(segment);
		})
		.join('/');
}

/**
 * Constructs a consistent API endpoint URL by combining base endpoint with encoded path.
 * Always ensures proper path separation without double slashes.
 */
export function buildApiEndpoint(baseEndpoint: string, path: string): string {
	const encodedPath = encodePath(path);

	// Remove trailing slash from baseEndpoint if present
	const cleanBase = baseEndpoint.endsWith('/') ? baseEndpoint.slice(0, -1) : baseEndpoint;

	// Ensure path starts with slash (encodePath guarantees this)
	return `${cleanBase}${encodedPath}`;
}

/**
 * Generates a URL-safe slug from a title string.
 * Converts to lowercase, removes special characters, and replaces spaces with hyphens.
 */
export function generateSlug(title: string): string {
	return title
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, '') // Remove special characters except spaces and hyphens
		.trim()
		.replace(/\s+/g, '-') // Replace spaces with hyphens
		.replace(/-+/g, '-'); // Remove multiple consecutive hyphens
}

/**
 * Gets the parent path of the given path.
 * For example: "/folder/subfolder/file" returns "/folder/subfolder"
 */
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

/**
 * Appends a name to a folder path; an empty parent or '/' means the root.
 * For example: ("/docs", "intro") returns "/docs/intro", ("/", "intro") returns "/intro".
 */
export function joinPath(parentPath: string, name: string): string {
	return parentPath && parentPath !== '/' ? `${parentPath}/${name}` : `/${name}`;
}

/** Whether `path` sits directly inside `folderPath` (not deeper); '' or '/' is the root. */
export function isDirectChild(path: string, folderPath: string): boolean {
	if (folderPath === '' || folderPath === '/') {
		return path.split('/').length === 2; // ['', 'name']
	}

	const folderSegments = folderPath.split('/').filter(Boolean);
	const segments = path.split('/').filter(Boolean);

	return (
		segments.length === folderSegments.length + 1 &&
		segments.slice(0, folderSegments.length).join('/') === folderSegments.join('/')
	);
}

/** Folder names: letters, digits, spaces, '-' and '_', at most 50 characters. */
export function isValidFolderName(name: string): boolean {
	return name.trim() !== '' && /^[a-zA-Z0-9\-_\s]+$/.test(name) && name.length <= 50;
}

/** The path segment a folder name is stored under: trimmed, lower case, spaces as '-'. */
export function folderNameToSegment(name: string): string {
	return name.trim().toLowerCase().replace(/\s+/g, '-');
}
