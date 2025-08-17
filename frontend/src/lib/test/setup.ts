import { vi } from 'vitest';

// Mock browser APIs that might not be available in jsdom
globalThis.ResizeObserver = vi.fn().mockImplementation(() => ({
	observe: vi.fn(),
	unobserve: vi.fn(),
	disconnect: vi.fn()
}));

// Mock IntersectionObserver for components that use it
globalThis.IntersectionObserver = vi.fn().mockImplementation(() => ({
	observe: vi.fn(),
	unobserve: vi.fn(),
	disconnect: vi.fn()
}));

// Mock crypto for random values
Object.defineProperty(globalThis, 'crypto', {
	value: {
		randomUUID: vi.fn().mockReturnValue('mock-uuid'),
		getRandomValues: vi.fn().mockImplementation((array) => {
			for (let i = 0; i < array.length; i++) {
				array[i] = Math.floor(Math.random() * 256);
			}
			return array;
		})
	}
});
