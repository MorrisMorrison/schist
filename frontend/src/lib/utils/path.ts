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
 * Creates a safe navigation path for goto() calls by encoding the path.
 */
export function createNavigationPath(path: string): string {
	return encodePath(path);
}

/**
 * Converts asset paths from frontend format (/assets/...) to backend format (/uploads/...).
 * Validates that the path actually starts with /assets/ before conversion.
 */
export function convertAssetPath(path: string): string {
	if (!path.startsWith('/assets/')) {
		throw new Error('Invalid asset path: must start with /assets/');
	}

	return path.replace('/assets/', '/uploads/');
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
 * Gets the depth (nesting level) of a path.
 * For example: "/" returns 0, "/folder" returns 1, "/folder/subfolder" returns 2
 */
export function getDepth(path: string): number {
	if (!path || path === '/') {
		return 0;
	}
	return path.split('/').filter((segment) => segment !== '').length;
}

/**
 * Validates if a path is properly formatted and safe.
 * Checks for proper structure and invalid characters.
 */
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
