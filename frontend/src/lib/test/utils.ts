import { vi, type MockedFunction } from 'vitest';
import type { ComponentType, SvelteComponent } from 'svelte';

/**
 * Create a mock function with better typing for events
 */
export function createMockEventHandler<T = any>(): MockedFunction<(event: T) => void> {
	return vi.fn();
}

/**
 * Create mock props for common component patterns
 */
export function createMockProps(overrides: Record<string, any> = {}): Record<string, any> {
	return {
		class: '',
		...overrides
	};
}

/**
 * Wait for async operations to complete in tests
 */
export async function waitForNextTick(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Fire a custom event on an element
 */
export function fireCustomEvent(element: Element, eventName: string, detail?: any) {
	const event = new CustomEvent(eventName, { detail });
	element.dispatchEvent(event);
}

/**
 * Mock store implementations for testing
 */
export function createMockStore<T>(initialValue: T) {
	let value = initialValue;
	const subscribers = new Set<(value: T) => void>();

	return {
		subscribe: (callback: (value: T) => void) => {
			subscribers.add(callback);
			callback(value);
			return () => subscribers.delete(callback);
		},
		set: (newValue: T) => {
			value = newValue;
			subscribers.forEach((callback) => callback(value));
		},
		update: (updater: (value: T) => T) => {
			value = updater(value);
			subscribers.forEach((callback) => callback(value));
		},
		get: () => value
	};
}

/**
 * Mock API client for testing
 */
export const mockApiClient = {
	get: vi.fn(),
	post: vi.fn(),
	put: vi.fn(),
	delete: vi.fn(),
	patch: vi.fn()
};

/**
 * Common test data factories
 */
export const testData = {
	document: {
		id: 'test-doc-id',
		content: '# Test Content\n\nThis is a test document.',
		metaData: {
			slug: 'test-document',
			title: 'Test Document',
			path: '/test/document',
			tags: ['test'],
			author: 'test-author',
			createdAt: '2024-01-01T00:00:00Z',
			updatedAt: '2024-01-01T00:00:00Z'
		}
	},
	folder: {
		id: 'test-folder-id',
		name: 'Test Folder',
		path: '/test',
		children: [],
		documentCount: 0,
		lastModified: '2024-01-01T00:00:00Z'
	},
	user: {
		id: 'test-user-id',
		email: 'test@example.com',
		name: 'Test User'
	}
};

/**
 * Helper to assert that an element has specific CSS classes
 */
export function expectElementToHaveClasses(element: Element, classes: string[]) {
	classes.forEach((className) => {
		expect(element.classList.contains(className)).toBe(true);
	});
}