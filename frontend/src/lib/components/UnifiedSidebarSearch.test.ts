import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import UnifiedSidebarSearch from './UnifiedSidebarSearch.svelte';

describe('UnifiedSidebarSearch', () => {
	afterEach(() => cleanup());

	it('exposes the given test id on the input', () => {
		render(UnifiedSidebarSearch, { props: { dataTestId: 'tree-search' } });

		expect(screen.getByTestId('tree-search')).toBeInstanceOf(HTMLInputElement);
	});

	it('uses sidebar-search as the default test id', () => {
		render(UnifiedSidebarSearch);

		expect(screen.getByTestId('sidebar-search')).toBeInstanceOf(HTMLInputElement);
	});

	it('reports every input and Enter to onSearch', async () => {
		const onSearch = vi.fn();
		render(UnifiedSidebarSearch, { props: { onSearch, placeholder: 'Find' } });
		const input = screen.getByPlaceholderText('Find');

		await fireEvent.input(input, { target: { value: 'tag:work' } });
		expect(onSearch).toHaveBeenLastCalledWith('tag:work');

		await fireEvent.keyDown(input, { key: 'Enter' });
		expect(onSearch).toHaveBeenCalledTimes(2);

		await fireEvent.keyDown(input, { key: 'a' });
		expect(onSearch).toHaveBeenCalledTimes(2);
	});

	it('clears the query with the clear button', async () => {
		const onSearch = vi.fn();
		render(UnifiedSidebarSearch, { props: { onSearch, value: 'draft' } });
		const input = screen.getByRole<HTMLInputElement>('textbox');
		expect(input.value).toBe('draft');

		await fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));

		expect(onSearch).toHaveBeenCalledWith('');
		expect(input.value).toBe('');
		expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument();
	});
});
