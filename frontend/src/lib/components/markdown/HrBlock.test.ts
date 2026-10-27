import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '#lib/test/component-utils.ts';
import HrBlock from './HrBlock.svelte';
import type { HrBlock as HrBlockType } from '#lib/utils/markdown-blocks.ts';

describe('HrBlock', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	const mockBlock: HrBlockType = {
		type: 'hr',
		id: 'test-hr',
		raw: '---'
	};

	it('renders hr element', () => {
		const { container } = render(HrBlock, {
			props: { block: mockBlock }
		});

		const hr = container.querySelector('hr');
		expect(hr).toBeInTheDocument();
	});

	it('renders as self-closing element with no content', () => {
		const { container } = render(HrBlock, {
			props: { block: mockBlock }
		});

		const hr = container.querySelector('hr');
		expect(hr).toBeInTheDocument();
		expect(hr?.innerHTML).toBe('');
		expect(hr?.textContent).toBe('');
	});
});
