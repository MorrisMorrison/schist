import { describe, test, expect, vi, beforeEach } from 'vitest';

// Mock the modules before importing the actual module
vi.mock('$app/navigation', () => ({
	goto: vi.fn()
}));

vi.mock('$lib/stores/theme.svelte', () => ({
	themeActions: {
		toggleTheme: vi.fn()
	}
}));

vi.mock('$lib/stores/sidebar.svelte', () => ({
	sidebarActions: {
		toggle: vi.fn()
	}
}));

// Import after mocking
import { createKeyboardShortcutHandler, KEYBOARD_SHORTCUTS } from './keyboard-shortcuts';
import type { KeyboardShortcutHandlers } from './keyboard-shortcuts';
import type { Page } from '@sveltejs/kit';
import { goto } from '$app/navigation';
import { themeActions } from '$lib/stores/theme.svelte';
import { sidebarActions } from '$lib/stores/sidebar.svelte';

// Mock page object matching SvelteKit's Page interface
const createMockPage = (pathname: string = '/'): Page<Record<string, string>, string | null> => ({
	url: {
		href: `http://localhost:5173${pathname}`,
		origin: 'http://localhost:5173',
		protocol: 'http:',
		username: '',
		password: '',
		host: 'localhost:5173',
		hostname: 'localhost',
		port: '5173',
		pathname,
		search: '',
		searchParams: new URLSearchParams(),
		hash: '',
		toString: () => `http://localhost:5173${pathname}`,
		toJSON: () => `http://localhost:5173${pathname}`
	},
	params: {},
	route: {
		id: pathname
	},
	status: 200,
	error: null,
	data: {},
	form: undefined,
	state: {}
});

// Mock document and window
const createMockDocument = () => {
	const mockElement = {
		tagName: 'DIV',
		contentEditable: 'false'
	};

	// Mock document.activeElement
	Object.defineProperty(document, 'activeElement', {
		value: mockElement,
		writable: true,
		configurable: true
	});

	// Mock window.dispatchEvent
	Object.defineProperty(window, 'dispatchEvent', {
		value: vi.fn(),
		writable: true,
		configurable: true
	});

	return mockElement;
};

// Create mock keyboard event
const createKeyboardEvent = (
	key: string,
	modifiers: { ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean } = {}
) => ({
	key,
	ctrlKey: modifiers.ctrlKey || false,
	metaKey: modifiers.metaKey || false,
	altKey: modifiers.altKey || false,
	preventDefault: vi.fn()
});

describe('keyboard-shortcuts', () => {
	let handlers: KeyboardShortcutHandlers;
	let mockActiveElement: ReturnType<typeof createMockDocument>;

	beforeEach(() => {
		// Reset all mocks
		vi.clearAllMocks();

		// Setup mock document
		mockActiveElement = createMockDocument();

		// Create handlers
		handlers = {
			openQuickSwitcher: vi.fn(),
			closeQuickSwitcher: vi.fn(),
			isQuickSwitcherOpen: vi.fn(() => false)
		};
	});

	describe('createKeyboardShortcutHandler', () => {
		test('opens quick switcher on Ctrl+K', () => {
			const page = createMockPage();
			const handler = createKeyboardShortcutHandler(page, handlers);
			const event = createKeyboardEvent('k', { ctrlKey: true });

			handler(event as unknown as KeyboardEvent);

			expect(event.preventDefault).toHaveBeenCalled();
			expect(handlers.openQuickSwitcher).toHaveBeenCalled();
		});

		test('opens quick switcher on Cmd+K (Mac)', () => {
			const page = createMockPage();
			const handler = createKeyboardShortcutHandler(page, handlers);
			const event = createKeyboardEvent('k', { metaKey: true });

			handler(event as unknown as KeyboardEvent);

			expect(event.preventDefault).toHaveBeenCalled();
			expect(handlers.openQuickSwitcher).toHaveBeenCalled();
		});

		test('closes quick switcher on Escape when open', () => {
			const page = createMockPage();
			handlers.isQuickSwitcherOpen = vi.fn(() => true);
			const handler = createKeyboardShortcutHandler(page, handlers);
			const event = createKeyboardEvent('Escape');

			handler(event as unknown as KeyboardEvent);

			expect(handlers.closeQuickSwitcher).toHaveBeenCalled();
		});

		test('does not close quick switcher on Escape when closed', () => {
			const page = createMockPage();
			handlers.isQuickSwitcherOpen = vi.fn(() => false);
			const handler = createKeyboardShortcutHandler(page, handlers);
			const event = createKeyboardEvent('Escape');

			handler(event as unknown as KeyboardEvent);

			expect(handlers.closeQuickSwitcher).not.toHaveBeenCalled();
		});

		test('navigates to new document on Ctrl+Alt+N', () => {
			const page = createMockPage();
			const handler = createKeyboardShortcutHandler(page, handlers);
			const event = createKeyboardEvent('n', { ctrlKey: true, altKey: true });

			handler(event as unknown as KeyboardEvent);

			expect(event.preventDefault).toHaveBeenCalled();
			expect(goto).toHaveBeenCalledWith('/new');
		});

		test('creates new document in current folder context', () => {
			const page = createMockPage('/documents/folder1/subfolder');
			const handler = createKeyboardShortcutHandler(page, handlers);
			const event = createKeyboardEvent('n', { ctrlKey: true, altKey: true });

			handler(event as unknown as KeyboardEvent);

			expect(goto).toHaveBeenCalledWith('/new/folder1/subfolder');
		});

		test('toggles theme on Ctrl+Alt+T', () => {
			const page = createMockPage();
			const handler = createKeyboardShortcutHandler(page, handlers);
			const event = createKeyboardEvent('t', { ctrlKey: true, altKey: true });

			handler(event as unknown as KeyboardEvent);

			expect(event.preventDefault).toHaveBeenCalled();
			expect(themeActions.toggleTheme).toHaveBeenCalled();
		});

		test('toggles sidebar on Ctrl+B', () => {
			const page = createMockPage();
			const handler = createKeyboardShortcutHandler(page, handlers);
			const event = createKeyboardEvent('b', { ctrlKey: true });

			handler(event as unknown as KeyboardEvent);

			expect(event.preventDefault).toHaveBeenCalled();
			expect(sidebarActions.toggle).toHaveBeenCalled();
		});

		test('navigates home on Ctrl+H', () => {
			const page = createMockPage('/settings');
			const handler = createKeyboardShortcutHandler(page, handlers);
			const event = createKeyboardEvent('h', { ctrlKey: true });

			handler(event as unknown as KeyboardEvent);

			expect(event.preventDefault).toHaveBeenCalled();
			expect(goto).toHaveBeenCalledWith('/');
		});

		test('navigates to settings on Ctrl+,', () => {
			const page = createMockPage();
			const handler = createKeyboardShortcutHandler(page, handlers);
			const event = createKeyboardEvent(',', { ctrlKey: true });

			handler(event as unknown as KeyboardEvent);

			expect(event.preventDefault).toHaveBeenCalled();
			expect(goto).toHaveBeenCalledWith('/settings');
		});

		test('ignores shortcuts when typing in input field', () => {
			mockActiveElement.tagName = 'INPUT';
			const page = createMockPage();
			const handler = createKeyboardShortcutHandler(page, handlers);
			const event = createKeyboardEvent('b', { ctrlKey: true });

			handler(event as unknown as KeyboardEvent);

			expect(event.preventDefault).not.toHaveBeenCalled();
			expect(sidebarActions.toggle).not.toHaveBeenCalled();
		});

		test('ignores shortcuts when typing in textarea', () => {
			mockActiveElement.tagName = 'TEXTAREA';
			const page = createMockPage();
			const handler = createKeyboardShortcutHandler(page, handlers);
			const event = createKeyboardEvent('b', { ctrlKey: true });

			handler(event as unknown as KeyboardEvent);

			expect(event.preventDefault).not.toHaveBeenCalled();
			expect(sidebarActions.toggle).not.toHaveBeenCalled();
		});

		test('ignores shortcuts when in contentEditable element', () => {
			mockActiveElement.contentEditable = 'true';
			const page = createMockPage();
			const handler = createKeyboardShortcutHandler(page, handlers);
			const event = createKeyboardEvent('b', { ctrlKey: true });

			handler(event as unknown as KeyboardEvent);

			expect(event.preventDefault).not.toHaveBeenCalled();
			expect(sidebarActions.toggle).not.toHaveBeenCalled();
		});

		test('allows quick switcher and escape when typing', () => {
			mockActiveElement.tagName = 'INPUT';
			const page = createMockPage();
			const handler = createKeyboardShortcutHandler(page, handlers);
			const event = createKeyboardEvent('k', { ctrlKey: true });

			handler(event as unknown as KeyboardEvent);

			expect(event.preventDefault).toHaveBeenCalled();
			expect(handlers.openQuickSwitcher).toHaveBeenCalled();
		});

		describe('document-specific shortcuts', () => {
			test('navigates to edit mode on Ctrl+E when viewing document', () => {
				const page = createMockPage('/documents/test-doc');
				const handler = createKeyboardShortcutHandler(page, handlers);
				const event = createKeyboardEvent('e', { ctrlKey: true });

				handler(event as unknown as KeyboardEvent);

				expect(event.preventDefault).toHaveBeenCalled();
				expect(goto).toHaveBeenCalledWith('/edit/test-doc');
			});

			test('dispatches delete event on Ctrl+Alt+D when viewing document', () => {
				const page = createMockPage('/documents/test-doc');
				const handler = createKeyboardShortcutHandler(page, handlers);
				const event = createKeyboardEvent('d', { ctrlKey: true, altKey: true });

				handler(event as unknown as KeyboardEvent);

				expect(event.preventDefault).toHaveBeenCalled();
				expect(window.dispatchEvent).toHaveBeenCalledWith(
					expect.objectContaining({
						type: 'deleteDocument',
						detail: { path: '/test-doc' }
					})
				);
			});

			test('dispatches download event on Ctrl+J when viewing document', () => {
				const page = createMockPage('/documents/nested/folder/doc');
				const handler = createKeyboardShortcutHandler(page, handlers);
				const event = createKeyboardEvent('j', { ctrlKey: true });

				handler(event as unknown as KeyboardEvent);

				expect(event.preventDefault).toHaveBeenCalled();
				expect(window.dispatchEvent).toHaveBeenCalledWith(
					expect.objectContaining({
						type: 'downloadDocument',
						detail: { path: '/nested/folder/doc' }
					})
				);
			});

			test('ignores document shortcuts when not viewing document', () => {
				const page = createMockPage('/settings');
				const handler = createKeyboardShortcutHandler(page, handlers);
				const event = createKeyboardEvent('e', { ctrlKey: true });

				handler(event as unknown as KeyboardEvent);

				expect(goto).not.toHaveBeenCalled();
			});
		});

		test('creates folder with Ctrl+Alt+F', async () => {
			const page = createMockPage();
			const handler = createKeyboardShortcutHandler(page, handlers);
			const event = createKeyboardEvent('f', { ctrlKey: true, altKey: true });

			handler(event as unknown as KeyboardEvent);

			expect(event.preventDefault).toHaveBeenCalled();
			expect(goto).toHaveBeenCalledWith('/folders');

			// Wait for the setTimeout to complete
			await new Promise((resolve) => setTimeout(resolve, 150));
			expect(window.dispatchEvent).toHaveBeenCalledWith(
				expect.objectContaining({
					type: 'createFolder'
				})
			);
		});
	});

	describe('KEYBOARD_SHORTCUTS constant', () => {
		test('exports keyboard shortcuts documentation', () => {
			expect(KEYBOARD_SHORTCUTS).toEqual({
				navigation: {
					'Cmd/Ctrl + K': 'Open Quick Switcher',
					'Cmd/Ctrl + H': 'Go to Home',
					'Cmd/Ctrl + ,': 'Go to Settings'
				},
				creation: {
					'Cmd/Ctrl + Alt + N': 'Create new document',
					'Cmd/Ctrl + Alt + F': 'Create new folder'
				},
				document: {
					'Cmd/Ctrl + E': 'Edit current document',
					'Cmd/Ctrl + S': 'Save document (silent save in editor)',
					'Cmd/Ctrl + Alt + D': 'Delete current document',
					'Cmd/Ctrl + J': 'Download current document'
				},
				ui: {
					'Cmd/Ctrl + Alt + T': 'Toggle theme',
					'Cmd/Ctrl + B': 'Toggle sidebar',
					Escape: 'Close Quick Switcher'
				}
			});
		});
	});
});
