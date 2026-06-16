import { describe, it, expect } from 'vitest';
import { normalizePath, encodePath, buildApiEndpoint, generateSlug, getParentPath } from './path';

describe('normalizePath', () => {
	it('should return "/" for empty string', () => {
		expect(normalizePath('')).toBe('/');
	});

	it('should add leading slash if missing', () => {
		expect(normalizePath('docs')).toBe('/docs');
		expect(normalizePath('docs/api')).toBe('/docs/api');
	});

	it('should remove trailing slash except for root', () => {
		expect(normalizePath('/docs/')).toBe('/docs');
		expect(normalizePath('/docs/api/')).toBe('/docs/api');
		expect(normalizePath('/')).toBe('/');
	});

	it('should collapse multiple slashes', () => {
		expect(normalizePath('//docs///api//')).toBe('/docs/api');
		expect(normalizePath('docs//api')).toBe('/docs/api');
	});

	it('should handle complex paths', () => {
		expect(normalizePath('docs/api/v1')).toBe('/docs/api/v1');
		expect(normalizePath('/docs//api///v1/')).toBe('/docs/api/v1');
	});
});

describe('encodePath', () => {
	it('should encode path segments', () => {
		expect(encodePath('/docs/hello world')).toBe('/docs/hello%20world');
		expect(encodePath('/docs/file (1).md')).toBe('/docs/file%20(1).md');
	});

	it('should handle root path', () => {
		expect(encodePath('/')).toBe('/');
		expect(encodePath('')).toBe('/');
	});

	it('should encode special characters', () => {
		expect(encodePath('/docs/café')).toBe('/docs/caf%C3%A9');
		expect(encodePath('/docs/file@v1')).toBe('/docs/file%40v1');
	});

	it('should normalize before encoding', () => {
		expect(encodePath('docs//hello world//')).toBe('/docs/hello%20world');
	});
});

describe('buildApiEndpoint', () => {
	it('should combine base and path correctly', () => {
		expect(buildApiEndpoint('/api', '/docs')).toBe('/api/docs');
		expect(buildApiEndpoint('/api/', '/docs')).toBe('/api/docs');
		expect(buildApiEndpoint('/api', 'docs')).toBe('/api/docs');
	});

	it('should handle encoded paths', () => {
		expect(buildApiEndpoint('/api', '/docs/hello world')).toBe('/api/docs/hello%20world');
	});

	it('should handle root path', () => {
		expect(buildApiEndpoint('/api', '/')).toBe('/api/');
	});

	it('should handle complex base URLs', () => {
		expect(buildApiEndpoint('http://localhost:3000/api', '/docs')).toBe(
			'http://localhost:3000/api/docs'
		);
	});
});

describe('generateSlug', () => {
	it('should convert to lowercase', () => {
		expect(generateSlug('Hello World')).toBe('hello-world');
		expect(generateSlug('API Documentation')).toBe('api-documentation');
	});

	it('should replace spaces with hyphens', () => {
		expect(generateSlug('Getting Started Guide')).toBe('getting-started-guide');
		expect(generateSlug('User   Guide')).toBe('user-guide');
	});

	it('should remove special characters', () => {
		expect(generateSlug('API Documentation!')).toBe('api-documentation');
		expect(generateSlug('User@Guide#1')).toBe('userguide1');
		expect(generateSlug('Test & Development')).toBe('test-development');
	});

	it('should handle multiple consecutive hyphens', () => {
		expect(generateSlug('Test---Guide')).toBe('test-guide');
		expect(generateSlug('API - - - Docs')).toBe('api-docs');
	});

	it('should trim whitespace', () => {
		expect(generateSlug('  Hello World  ')).toBe('hello-world');
		expect(generateSlug('\t\nTest\t\n')).toBe('test');
	});
});

describe('getParentPath', () => {
	it('should return parent path', () => {
		expect(getParentPath('/docs/api/v1')).toBe('/docs/api');
		expect(getParentPath('/docs/guide')).toBe('/docs');
		expect(getParentPath('/docs')).toBe('/');
	});

	it('should handle root path', () => {
		expect(getParentPath('/')).toBe('/');
		expect(getParentPath('')).toBe('/');
	});

	it('should handle single level paths', () => {
		expect(getParentPath('/docs')).toBe('/');
	});
});

describe('path handling consistency', () => {
	it('should handle various input formats consistently', () => {
		const inputs = [
			'',
			'/',
			'//',
			'docs',
			'/docs',
			'/docs/',
			'//docs//',
			'docs/api',
			'/docs/api',
			'/docs/api/',
			'//docs//api//'
		];

		inputs.forEach((input) => {
			const normalized = normalizePath(input);
			expect(normalized).toMatch(/^\/([^/]+(\/[^/]+)*)?$/);
			expect(normalized.endsWith('/') && normalized !== '/').toBe(false);
		});
	});

	it('should roundtrip normalize and encode correctly', () => {
		const paths = ['/docs', '/docs/api', '/docs/hello world', '/docs/file (1).md'];

		paths.forEach((path) => {
			const normalized = normalizePath(path);
			const encoded = encodePath(normalized);
			expect(encoded.startsWith('/')).toBe(true);
			expect(encoded.includes('//')).toBe(false);
		});
	});
});
