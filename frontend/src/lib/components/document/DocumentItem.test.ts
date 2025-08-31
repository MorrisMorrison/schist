import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, user } from '$lib/test/component-utils.js';
import DocumentItem from './DocumentItem.svelte';
import type { Document } from '$lib/api/types.js';

// Mock Lucide icons
vi.mock('@lucide/svelte', () => {
	return {
		File: () => ({ $$: { fragment: null } }),
		MoreVertical: () => ({ $$: { fragment: null } })
	};
});

// Mock cn utility
vi.mock('$lib/utils.js', () => ({
	cn: (...classes: (string | undefined | boolean)[]) => classes.filter(Boolean).join(' ')
}));

describe('DocumentItem', () => {
	const mockDocument: Document = {
		metaData: {
			title: 'Test Document',
			path: '/test/document.md',
			slug: 'test-document'
		},
		content: '# Test Document\n\nTest content'
	};

	const defaultProps = {
		document: mockDocument,
		depth: 0,
		isSelected: false,
		isCurrent: false,
		enableContextMenu: true,
		isDragging: false,
		draggedItem: null,
		dropTarget: null,
		dragOverTarget: null,
		onSelect: vi.fn(),
		onContextMenu: vi.fn(),
		onDragStart: vi.fn(),
		onDragEnd: vi.fn(),
		onDragOver: vi.fn(),
		onDragEnter: vi.fn(),
		onDragLeave: vi.fn(),
		onDrop: vi.fn()
	};

	beforeEach(() => {
		document.body.innerHTML = '';
		vi.clearAllMocks();
	});

	it('renders document item', () => {
		const { container } = render(DocumentItem, {
			props: defaultProps
		});

		const item = container.querySelector('[data-testid="document-item"]');
		expect(item).toBeInTheDocument();
		expect(item).toHaveAttribute('data-document-path', '/test/document.md');
	});

	it('displays document title or "Untitled"', () => {
		const { container } = render(DocumentItem, {
			props: defaultProps
		});
		expect(container).toHaveTextContent('Test Document');

		const documentWithoutTitle: Document = {
			...mockDocument,
			metaData: { ...mockDocument.metaData, title: '' }
		};

		const { container: untitledContainer } = render(DocumentItem, {
			props: { ...defaultProps, document: documentWithoutTitle }
		});
		expect(untitledContainer).toHaveTextContent('Untitled');
	});

	it('handles selection click', async () => {
		const onSelect = vi.fn();
		const { container } = render(DocumentItem, {
			props: { ...defaultProps, onSelect }
		});

		const nameButton = container.querySelector(
			'[data-testid="document-name-button"]'
		) as HTMLElement;
		await user.click(nameButton);

		expect(onSelect).toHaveBeenCalledTimes(1);
	});

	it('shows context menu when enabled', () => {
		const { container } = render(DocumentItem, {
			props: { ...defaultProps, enableContextMenu: true }
		});

		const contextMenuButton = container.querySelector(
			'[role="button"][aria-label="Document options"]'
		);
		expect(contextMenuButton).toBeInTheDocument();
	});

	it('does not show context menu when disabled', () => {
		const { container } = render(DocumentItem, {
			props: { ...defaultProps, enableContextMenu: false }
		});

		const contextMenuButton = container.querySelector(
			'[role="button"][aria-label="Document options"]'
		);
		expect(contextMenuButton).not.toBeInTheDocument();
	});

	it('calls context menu handler when clicked', async () => {
		const onContextMenu = vi.fn();
		const { container } = render(DocumentItem, {
			props: { ...defaultProps, onContextMenu }
		});

		const contextMenuButton = container.querySelector(
			'[role="button"][aria-label="Document options"]'
		) as HTMLElement;
		await user.click(contextMenuButton);

		expect(onContextMenu).toHaveBeenCalledTimes(1);
	});
});
