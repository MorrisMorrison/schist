import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '$lib/test/component-utils';
import ListBlock from './ListBlock.svelte';
import type { ListBlock as ListBlockType, ListItemBlock } from '$lib/utils/markdown-blocks';

describe('ListBlock', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	const createMockListItems = (count: number = 3): ListItemBlock[] => {
		return Array.from({ length: count }, (_, i) => ({
			type: 'list_item',
			id: `item-${i}`,
			text: `List item ${i + 1}`,
			raw: `- List item ${i + 1}`,
			task: false,
			checked: false
		}));
	};

	it('renders unordered list with correct structure and items', () => {
		const mockBlock: ListBlockType = {
			type: 'list',
			id: 'list-1',
			ordered: false,
			items: createMockListItems(3),
			raw: '- Item 1\n- Item 2\n- Item 3'
		};

		const { container } = render(ListBlock, {
			props: { block: mockBlock }
		});

		const list = container.querySelector('ul');
		expect(list).toBeInTheDocument();
		expect(list).toHaveClass('list-disc');

		const listItems = container.querySelectorAll('ul li');
		expect(listItems).toHaveLength(3);
	});

	it('renders ordered list with correct structure and items', () => {
		const mockBlock: ListBlockType = {
			type: 'list',
			id: 'list-1',
			ordered: true,
			items: createMockListItems(3),
			raw: '1. Item 1\n2. Item 2\n3. Item 3'
		};

		const { container } = render(ListBlock, {
			props: { block: mockBlock }
		});

		const list = container.querySelector('ol');
		expect(list).toBeInTheDocument();
		expect(list).toHaveClass('list-decimal');

		const listItems = container.querySelectorAll('ol li');
		expect(listItems).toHaveLength(3);

		// Should not render ul for ordered lists
		const unorderedList = container.querySelector('ul');
		expect(unorderedList).not.toBeInTheDocument();
	});

	it('handles mixed list items including tasks', () => {
		const mixedItems: ListItemBlock[] = [
			{
				type: 'list_item',
				id: 'item-1',
				text: 'Regular item',
				raw: '- Regular item',
				task: false,
				checked: false
			},
			{
				type: 'list_item',
				id: 'item-2',
				text: 'Task item',
				raw: '- [ ] Task item',
				task: true,
				checked: false
			}
		];

		const mockBlock: ListBlockType = {
			type: 'list',
			id: 'list-1',
			ordered: false,
			items: mixedItems,
			raw: '- Regular item\n- [ ] Task item'
		};

		const { container } = render(ListBlock, {
			props: { block: mockBlock }
		});

		const list = container.querySelector('ul');
		expect(list).toBeInTheDocument();

		const listItems = container.querySelectorAll('li');
		expect(listItems).toHaveLength(2);
	});

	it('handles empty lists', () => {
		const mockBlock: ListBlockType = {
			type: 'list',
			id: 'list-1',
			ordered: false,
			items: [],
			raw: ''
		};

		const { container } = render(ListBlock, {
			props: { block: mockBlock }
		});

		const list = container.querySelector('ul');
		expect(list).toBeInTheDocument();

		const listItems = container.querySelectorAll('li');
		expect(listItems).toHaveLength(0);
	});
});
