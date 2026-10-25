import { vi } from 'vitest';
import '@testing-library/jest-dom';

// Tests run in real Chromium, which has ResizeObserver and IntersectionObserver.
// Only stub them if missing: the old vi.fn(() => ({...})) stand-ins are not
// constructible under Vitest 4, so `new ResizeObserver()` (CodeMirror, the graph
// view) threw.
class ObserverStub {
	observe() {}
	unobserve() {}
	disconnect() {}
	takeRecords() {
		return [];
	}
}
globalThis.ResizeObserver ??= ObserverStub as unknown as typeof ResizeObserver;
globalThis.IntersectionObserver ??= ObserverStub as unknown as typeof IntersectionObserver;

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

// Mock SvelteKit navigation
vi.mock('$app/navigation', () => ({
	goto: vi.fn(),
	replaceState: vi.fn(),
	preloadData: vi.fn(),
	beforeNavigate: vi.fn(),
	afterNavigate: vi.fn()
}));

// Mock SvelteKit stores
vi.mock('$app/stores', () => ({
	page: { subscribe: vi.fn() },
	navigating: { subscribe: vi.fn() },
	updated: { subscribe: vi.fn() }
}));

// Mock SvelteKit environment
vi.mock('$app/environment', () => ({
	browser: true,
	dev: true,
	building: false,
	version: 'test'
}));
