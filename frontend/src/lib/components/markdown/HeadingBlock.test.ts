import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '$lib/test/component-utils';
import HeadingBlock from './HeadingBlock.svelte';
import type { HeadingBlock as HeadingBlockType } from '$lib/utils/markdown-blocks';

describe('HeadingBlock', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	const createMockHeadingBlock = (overrides: Partial<HeadingBlockType> = {}): HeadingBlockType => ({
		type: 'heading',
		id: 'test-heading-1',
		level: 1,
		text: 'Test Heading',
		raw: '# Test Heading',
		...overrides
	});

	it('renders correct heading element with level and text', () => {
		const block = createMockHeadingBlock({ level: 2, text: 'Section Title' });
		const { container } = render(HeadingBlock, { props: { block } });

		const heading = container.querySelector('h2');
		expect(heading).toBeInTheDocument();
		expect(heading).toHaveTextContent('Section Title');
	});

	it('renders correct heading levels', () => {
		const levels: Array<1 | 2 | 3 | 4 | 5 | 6> = [1, 3, 6];

		levels.forEach((level) => {
			document.body.innerHTML = '';
			const block = createMockHeadingBlock({ level, text: `Heading ${level}` });
			const { container } = render(HeadingBlock, { props: { block } });

			const heading = container.querySelector(`h${level}`);
			expect(heading).toBeInTheDocument();
			expect(heading).toHaveTextContent(`Heading ${level}`);
		});
	});

	it('renders HTML content in heading text', () => {
		const block = createMockHeadingBlock({
			level: 2,
			text: 'Heading with <strong>bold</strong> text'
		});
		const { container } = render(HeadingBlock, { props: { block } });

		const heading = container.querySelector('h2');
		const strongElement = heading?.querySelector('strong');
		expect(strongElement).toBeInTheDocument();
		expect(strongElement).toHaveTextContent('bold');
	});
});
