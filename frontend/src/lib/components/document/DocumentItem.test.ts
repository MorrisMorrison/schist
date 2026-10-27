import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, user, fireEvent } from '#lib/test/component-utils.ts';
import DocumentItem from './DocumentItem.svelte';
import type { Document } from '#lib/api/types.ts';

// Mock Lucide icons
vi.mock('@lucide/svelte', () => {
	return {
		File: () => ({ $$: { fragment: null } }),
		MoreVertical: () => ({ $$: { fragment: null } })
	};
});

// Mock cn utility
vi.mock('#lib/utils.ts', () => ({
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
		dnd: {
			isDragging: false,
			draggedItem: null,
			dropTarget: null,
			dragOverTarget: null,
			handleDragStart: vi.fn(),
			handleDragEnd: vi.fn(),
			handleDragOver: vi.fn(),
			handleDragEnter: vi.fn(),
			handleDragLeave: vi.fn(),
			handleDrop: vi.fn()
		},
		folderPath: '/test',
		onSelect: vi.fn(),
		onContextMenu: vi.fn()
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

	it('opens the context menu from the keyboard', async () => {
		const onContextMenu = vi.fn();
		const { container } = render(DocumentItem, {
			props: { ...defaultProps, onContextMenu }
		});
		const options = container.querySelector<HTMLElement>('[aria-label="Document options"]')!;

		await fireEvent.keyDown(options, { key: 'Enter' });
		await fireEvent.keyDown(options, { key: ' ' });
		await fireEvent.keyDown(options, { key: 'a' });

		expect(onContextMenu).toHaveBeenCalledTimes(2);
	});

	it('forwards drag events with the document', async () => {
		const { container } = render(DocumentItem, { props: defaultProps });
		const item = container.querySelector('[data-testid="document-item"]')!;

		await fireEvent.dragStart(item);
		await fireEvent.dragEnter(item);
		await fireEvent.dragOver(item);
		await fireEvent.dragLeave(item);
		await fireEvent.drop(item);
		await fireEvent.dragEnd(item);

		const { dnd } = defaultProps;
		expect(dnd.handleDragStart).toHaveBeenCalledWith(
			expect.any(Event),
			'page',
			'/test/document.md',
			mockDocument
		);
		// Dropping on a document targets the folder it is in.
		expect(dnd.handleDragEnter).toHaveBeenCalledWith(expect.any(Event), '/test');
		expect(dnd.handleDragOver).toHaveBeenCalledWith(expect.any(Event), '/test');
		expect(dnd.handleDragLeave).toHaveBeenCalledWith(expect.any(Event), '/test');
		expect(dnd.handleDrop).toHaveBeenCalledWith(expect.any(Event), '/test');
		expect(dnd.handleDragEnd).toHaveBeenCalled();
	});
});
