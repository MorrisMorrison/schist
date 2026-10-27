import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '#lib/test/component-utils.ts';
import BlockquoteBlock from './BlockquoteBlock.svelte';
import type { BlockquoteBlock as BlockquoteBlockType } from '#lib/utils/markdown-blocks.ts';

// Mock the sanitizer module
vi.mock('#lib/utils/sanitizer.ts', () => {
	return {
		sanitizeHtml: (html: string) => html
	};
});

describe('BlockquoteBlock', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	const mockBlock: BlockquoteBlockType = {
		type: 'blockquote',
		id: 'test-blockquote',
		text: 'This is a blockquote text',
		raw: '> This is a blockquote text'
	};

	it('renders blockquote element with text content', () => {
		const { container } = render(BlockquoteBlock, {
			props: { block: mockBlock }
		});

		const blockquote = container.querySelector('blockquote');
		expect(blockquote).toBeInTheDocument();
		expect(blockquote).toHaveTextContent('This is a blockquote text');
	});

	it('renders HTML content in blockquote', () => {
		const htmlBlock: BlockquoteBlockType = {
			...mockBlock,
			text: 'This is <strong>bold</strong> text in blockquote'
		};

		const { container } = render(BlockquoteBlock, {
			props: { block: htmlBlock }
		});

		const blockquote = container.querySelector('blockquote');
		const strongElement = blockquote?.querySelector('strong');
		expect(strongElement).toBeInTheDocument();
		expect(strongElement).toHaveTextContent('bold');
	});
});
