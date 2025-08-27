import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '$lib/test/component-utils';
import ListItemBlock from './ListItemBlock.svelte';
import type { ListItemBlock as ListItemBlockType } from '$lib/utils/markdown-blocks';

describe('ListItemBlock', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	it('renders regular list item with text content', () => {
		const mockBlock: ListItemBlockType = {
			type: 'list_item',
			id: 'item-1',
			text: 'This is a regular list item',
			raw: '- This is a regular list item',
			task: false,
			checked: false
		};

		const { container } = render(ListItemBlock, {
			props: { block: mockBlock }
		});

		const listItem = container.querySelector('li');
		expect(listItem).toBeInTheDocument();
		expect(listItem).toHaveTextContent('This is a regular list item');
		expect(listItem).not.toHaveAttribute('data-testid');
	});

	it('renders task item with checkbox', () => {
		const mockBlock: ListItemBlockType = {
			type: 'list_item',
			id: 'item-1',
			text: 'This is an unchecked task',
			raw: '- [ ] This is an unchecked task',
			task: true,
			checked: false
		};

		const { container } = render(ListItemBlock, {
			props: { block: mockBlock }
		});

		const listItem = container.querySelector('li');
		expect(listItem).toBeInTheDocument();
		expect(listItem).toHaveAttribute('data-testid', 'task-item');

		const checkbox = listItem?.querySelector('[role="checkbox"]');
		expect(checkbox).toBeInTheDocument();
		expect(checkbox).toHaveAttribute('aria-checked', 'false');
		expect(checkbox).toHaveAttribute('disabled');
	});

	it('renders checked task item correctly', () => {
		const mockBlock: ListItemBlockType = {
			type: 'list_item',
			id: 'item-1',
			text: 'This is a checked task',
			raw: '- [x] This is a checked task',
			task: true,
			checked: true
		};

		const { container } = render(ListItemBlock, {
			props: { block: mockBlock }
		});

		const listItem = container.querySelector('li');
		expect(listItem).toHaveAttribute('data-testid', 'task-item');

		const checkbox = listItem?.querySelector('[role="checkbox"]');
		expect(checkbox).toBeInTheDocument();
		expect(checkbox).toHaveAttribute('aria-checked', 'true');
	});

	it('renders HTML content in list items', () => {
		const mockBlock: ListItemBlockType = {
			type: 'list_item',
			id: 'item-1',
			text: 'This has <strong>bold</strong> and <em>italic</em> text',
			raw: '- This has **bold** and *italic* text',
			task: false,
			checked: false
		};

		const { container } = render(ListItemBlock, {
			props: { block: mockBlock }
		});

		const listItem = container.querySelector('li');
		const strongElement = listItem?.querySelector('strong');
		const emElement = listItem?.querySelector('em');
		expect(strongElement).toBeInTheDocument();
		expect(emElement).toBeInTheDocument();
		expect(strongElement).toHaveTextContent('bold');
		expect(emElement).toHaveTextContent('italic');
	});
});
