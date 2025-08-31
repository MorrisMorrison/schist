import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '$lib/test/component-utils';
import TableBlock from './TableBlock.svelte';
import type { TableBlock as TableBlockType } from '$lib/utils/markdown-blocks';

describe('TableBlock', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	const createBasicTable = (): TableBlockType => ({
		type: 'table',
		id: 'table-1',
		header: ['Column 1', 'Column 2', 'Column 3'],
		rows: [
			['Row 1 Col 1', 'Row 1 Col 2', 'Row 1 Col 3'],
			['Row 2 Col 1', 'Row 2 Col 2', 'Row 2 Col 3']
		],
		align: [null, null, null],
		raw: '| Column 1 | Column 2 | Column 3 |\n|----------|----------|----------|\n| Row 1 Col 1 | Row 1 Col 2 | Row 1 Col 3 |\n| Row 2 Col 1 | Row 2 Col 2 | Row 2 Col 3 |'
	});

	it('renders table with correct structure and content', () => {
		const { container } = render(TableBlock, {
			props: { block: createBasicTable() }
		});

		const table = container.querySelector('table');
		expect(table).toBeInTheDocument();

		const headerCells = container.querySelectorAll('thead th');
		expect(headerCells).toHaveLength(3);
		expect(headerCells[0]).toHaveTextContent('Column 1');
		expect(headerCells[1]).toHaveTextContent('Column 2');
		expect(headerCells[2]).toHaveTextContent('Column 3');

		const bodyRows = container.querySelectorAll('tbody tr');
		expect(bodyRows).toHaveLength(2);

		const firstRowCells = container.querySelectorAll('tbody tr:first-child td');
		expect(firstRowCells[0]).toHaveTextContent('Row 1 Col 1');
		expect(firstRowCells[1]).toHaveTextContent('Row 1 Col 2');
		expect(firstRowCells[2]).toHaveTextContent('Row 1 Col 3');
	});

	it('applies column alignment correctly', () => {
		const mockTable: TableBlockType = {
			...createBasicTable(),
			align: ['left', 'center', 'right']
		};

		const { container } = render(TableBlock, {
			props: { block: mockTable }
		});

		const headerCells = container.querySelectorAll('thead th');
		const firstRowCells = container.querySelectorAll('tbody tr:first-child td');

		expect(headerCells[0]).toHaveClass('text-left');
		expect(headerCells[1]).toHaveClass('text-center');
		expect(headerCells[2]).toHaveClass('text-right');

		expect(firstRowCells[0]).toHaveClass('text-left');
		expect(firstRowCells[1]).toHaveClass('text-center');
		expect(firstRowCells[2]).toHaveClass('text-right');
	});

	it('renders HTML content in cells', () => {
		const mockTable: TableBlockType = {
			...createBasicTable(),
			header: ['<strong>Bold Header</strong>', 'Plain Header'],
			rows: [['<em>Italic</em>', 'Plain text']]
		};

		const { container } = render(TableBlock, {
			props: { block: mockTable }
		});

		const strongElement = container.querySelector('thead strong');
		const emElement = container.querySelector('tbody em');

		expect(strongElement).toBeInTheDocument();
		expect(strongElement).toHaveTextContent('Bold Header');
		expect(emElement).toBeInTheDocument();
		expect(emElement).toHaveTextContent('Italic');
	});

	it('handles empty tables', () => {
		const mockTable: TableBlockType = {
			type: 'table',
			id: 'table-1',
			header: [],
			rows: [],
			align: [],
			raw: ''
		};

		const { container } = render(TableBlock, {
			props: { block: mockTable }
		});

		const table = container.querySelector('table');
		expect(table).toBeInTheDocument();

		const headerCells = container.querySelectorAll('thead th');
		const bodyRows = container.querySelectorAll('tbody tr');

		expect(headerCells).toHaveLength(0);
		expect(bodyRows).toHaveLength(0);
	});
});
