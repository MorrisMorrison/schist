import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '$lib/test/component-utils';
import HtmlBlock from './HtmlBlock.svelte';
import type { HtmlBlock as HtmlBlockType } from '$lib/utils/markdown-blocks';

// Mock the sanitizer module
vi.mock('$lib/utils/sanitizer', () => {
	return {
		sanitizeHtml: (html: string) => html
	};
});

describe('HtmlBlock', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	const mockBlock: HtmlBlockType = {
		type: 'html',
		id: 'test-html',
		html: '<div>Custom HTML content</div>',
		raw: '<div>Custom HTML content</div>'
	};

	it('renders HTML content inside wrapper div', () => {
		const { container } = render(HtmlBlock, {
			props: { block: mockBlock }
		});

		const htmlBlockDiv = container.querySelector('.html-block');
		expect(htmlBlockDiv).toBeInTheDocument();

		const innerDiv = htmlBlockDiv?.querySelector('div');
		expect(innerDiv).toBeInTheDocument();
		expect(innerDiv).toHaveTextContent('Custom HTML content');
	});

	it('handles complex HTML structures', () => {
		const complexBlock: HtmlBlockType = {
			...mockBlock,
			html: '<div class="custom-class"><p>Paragraph</p><ul><li>Item 1</li><li>Item 2</li></ul></div>'
		};

		const { container } = render(HtmlBlock, {
			props: { block: complexBlock }
		});

		const htmlBlockDiv = container.querySelector('.html-block');
		const paragraph = htmlBlockDiv?.querySelector('p');
		const list = htmlBlockDiv?.querySelector('ul');
		const listItems = htmlBlockDiv?.querySelectorAll('li');

		expect(paragraph).toBeInTheDocument();
		expect(paragraph).toHaveTextContent('Paragraph');
		expect(list).toBeInTheDocument();
		expect(listItems).toHaveLength(2);
		expect(listItems?.[0]).toHaveTextContent('Item 1');
		expect(listItems?.[1]).toHaveTextContent('Item 2');
	});

});
