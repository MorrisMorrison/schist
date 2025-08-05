import { goto } from '$app/navigation';
import type { Page } from '@sveltejs/kit';
import { themeActions } from '$lib/stores/theme.js';
import { sidebarActions } from '$lib/stores/sidebar';

export interface KeyboardShortcutHandlers {
	openQuickSwitcher: () => void;
	closeQuickSwitcher: () => void;
	isQuickSwitcherOpen: () => boolean;
}

export function createKeyboardShortcutHandler(page: Page, handlers: KeyboardShortcutHandlers) {
	return function handleGlobalKeydown(event: KeyboardEvent) {
		const isCmdOrCtrl = event.metaKey || event.ctrlKey;
		const currentPath = page.url.pathname;

		// Prevent shortcuts when user is typing in input fields
		const activeElement = document.activeElement as HTMLElement;
		const isTyping =
			activeElement &&
			(activeElement.tagName === 'INPUT' ||
				activeElement.tagName === 'TEXTAREA' ||
				(activeElement as HTMLElement).contentEditable === 'true');

		// Only allow Escape and Quick Switcher when typing
		if (isTyping && !(event.key === 'Escape' || (isCmdOrCtrl && event.key === 'k'))) {
			return;
		}

		// Quick switcher: Cmd/Ctrl + K
		if (isCmdOrCtrl && event.key === 'k') {
			event.preventDefault();
			handlers.openQuickSwitcher();
			return;
		}

		// Close quick switcher on Escape
		if (event.key === 'Escape' && handlers.isQuickSwitcherOpen()) {
			handlers.closeQuickSwitcher();
			return;
		}

		// Don't handle other shortcuts when typing or quick switcher is open
		if (isTyping || handlers.isQuickSwitcherOpen()) return;

		// Document creation shortcuts
		if (isCmdOrCtrl && event.key === 'n') {
			event.preventDefault();
			if (event.shiftKey) {
				// Cmd/Ctrl + Shift + N: Create folder
				handleCreateFolder(currentPath);
			} else {
				// Cmd/Ctrl + N: Create new document
				handleCreateDocument(currentPath);
			}
			return;
		}

		// Document actions (only when viewing a document)
		if (currentPath.startsWith('/documents/')) {
			const documentPath = currentPath.replace('/documents', '');

			// Cmd/Ctrl + E: Edit current document
			if (isCmdOrCtrl && event.key === 'e') {
				event.preventDefault();
				goto(`/edit${documentPath}`);
				return;
			}

			// Cmd/Ctrl + D: Delete current document
			if (isCmdOrCtrl && event.key === 'd') {
				event.preventDefault();
				handleDeleteDocument(documentPath);
				return;
			}

			// Cmd/Ctrl + S: Download/Save current document
			if (isCmdOrCtrl && event.key === 's') {
				event.preventDefault();
				handleDownloadDocument(documentPath);
				return;
			}
		}

		// Navigation shortcuts
		if (isCmdOrCtrl) {
			// Cmd/Ctrl + ,: Go to Settings
			if (event.key === ',') {
				event.preventDefault();
				goto('/settings');
				return;
			}

			// Cmd/Ctrl + H: Go to Home
			if (event.key === 'h') {
				event.preventDefault();
				goto('/');
				return;
			}
		}

		// UI toggles
		if (isCmdOrCtrl) {
			// Cmd/Ctrl + T: Toggle theme
			if (event.key === 't') {
				event.preventDefault();
				themeActions.toggleTheme();
				return;
			}

			// Cmd/Ctrl + B: Toggle sidebar
			if (event.key === 'b') {
				event.preventDefault();
				sidebarActions.toggle();
				return;
			}
		}
	};
}

function handleCreateDocument(currentPath: string) {
	const newDocPath = currentPath.startsWith('/documents/')
		? `/new${currentPath.replace('/documents', '')}`
		: '/new';
	goto(newDocPath);
}

function handleCreateFolder(currentPath: string) {
	// Navigate to current folder (or root) and trigger folder creation
	const folderPath = currentPath.startsWith('/documents/')
		? currentPath.replace('/documents', '/folders')
		: '/folders';
	goto(folderPath);
	// Dispatch event to trigger folder creation modal
	setTimeout(() => {
		window.dispatchEvent(new CustomEvent('createFolder'));
	}, 100);
}

function handleDeleteDocument(documentPath: string) {
	// Dispatch event to trigger delete confirmation
	window.dispatchEvent(
		new CustomEvent('deleteDocument', {
			detail: { path: documentPath }
		})
	);
}

function handleDownloadDocument(documentPath: string) {
	// Dispatch event to trigger document download
	window.dispatchEvent(
		new CustomEvent('downloadDocument', {
			detail: { path: documentPath }
		})
	);
}

// Keyboard shortcut documentation for help/reference
export const KEYBOARD_SHORTCUTS = {
	navigation: {
		'Cmd/Ctrl + K': 'Open Quick Switcher',
		'Cmd/Ctrl + H': 'Go to Home',
		'Cmd/Ctrl + ,': 'Go to Settings'
	},
	creation: {
		'Cmd/Ctrl + N': 'Create new document',
		'Cmd/Ctrl + Shift + N': 'Create new folder'
	},
	document: {
		'Cmd/Ctrl + E': 'Edit current document',
		'Cmd/Ctrl + D': 'Delete current document',
		'Cmd/Ctrl + S': 'Download current document'
	},
	ui: {
		'Cmd/Ctrl + T': 'Toggle theme',
		'Cmd/Ctrl + B': 'Toggle sidebar',
		Escape: 'Close Quick Switcher'
	}
} as const;
