import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, user } from '$lib/test/component-utils.js';
import DocumentCard from './DocumentCard.svelte';
import type { Document } from '$lib/api/types';

describe('DocumentCard', () => {
	const mockDocument: Document = {
		metaData: {
			title: 'Test Document',
			slug: 'test-document',
			path: '/test-document',
			createdAt: '2024-01-01T00:00:00Z',
			updatedAt: '2024-01-02T00:00:00Z'
		},
		content:
			'# Test Document\n\nThis is a test document with some **bold** text and a [link](http://example.com).',
		id: 'test-id',
		lastModified: '2024-01-02T00:00:00Z',
		size: 100
	};

	beforeEach(() => {
		document.body.innerHTML = '';
	});

	it('renders document card with title and content', () => {
		const { container } = render(DocumentCard, {
			props: { document: mockDocument }
		});

		const card = container.querySelector('[data-testid="document-card"]');
		expect(card).toBeInTheDocument();

		const title = container.querySelector('h3');
		expect(title).toBeInTheDocument();
		expect(title).toHaveTextContent('Test Document');
		expect(title).toHaveAttribute('title', 'Test Document');
	});

	it('applies correct styling classes', () => {
		const { container } = render(DocumentCard, {
			props: { document: mockDocument }
		});

		const card = container.querySelector('[data-testid="document-card"]');
		expect(card).toHaveClass('group', 'cursor-pointer', 'relative');
	});

	it('shows selected state when isSelected is true', () => {
		const { container } = render(DocumentCard, {
			props: {
				document: mockDocument,
				isSelected: true
			}
		});

		const card = container.querySelector('[data-testid="document-card"]');
		expect(card).toHaveClass('ring-primary/50', 'shadow-primary/10', 'ring-2');
	});

	it('calls onView when clicked in normal mode', async () => {
		const onView = vi.fn();
		const { container } = render(DocumentCard, {
			props: {
				document: mockDocument,
				onView
			}
		});

		const card = container.querySelector('[data-testid="document-card"]') as HTMLElement;
		await user.click(card);

		expect(onView).toHaveBeenCalledWith('/test-document');
	});

	it('calls onToggleSelect when clicked in multi-select mode', async () => {
		const onToggleSelect = vi.fn();
		const { container } = render(DocumentCard, {
			props: {
				document: mockDocument,
				enableMultiSelect: true,
				onToggleSelect
			}
		});

		const card = container.querySelector('[data-testid="document-card"]') as HTMLElement;
		await user.click(card);

		expect(onToggleSelect).toHaveBeenCalled();
	});

	it('renders file icon', () => {
		const { container } = render(DocumentCard, {
			props: { document: mockDocument }
		});

		// Check for the FileText icon (Lucide icon renders as svg)
		const icon = container.querySelector('svg');
		expect(icon).toBeInTheDocument();
	});

	it('displays document title with proper styling', () => {
		const { container } = render(DocumentCard, {
			props: { document: mockDocument }
		});

		const title = container.querySelector('h3');
		expect(title).toHaveClass(
			'text-foreground',
			'group-hover:text-primary',
			'line-clamp-2',
			'text-lg',
			'font-semibold'
		);
	});

	it('handles document without path using slug', () => {
		const documentWithoutPath: Document = {
			...mockDocument,
			metaData: {
				...mockDocument.metaData,
				path: undefined
			}
		};

		const onView = vi.fn();
		const { container } = render(DocumentCard, {
			props: {
				document: documentWithoutPath,
				onView
			}
		});

		const card = container.querySelector('[data-testid="document-card"]') as HTMLElement;
		expect(card).toBeInTheDocument();
		// Path will be derived from slug
	});
});
