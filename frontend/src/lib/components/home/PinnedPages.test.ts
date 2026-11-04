import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import type { DocumentSummary } from '#lib/api/types.ts';

vi.mock('#lib/api/client.ts', () => ({ apiClient: {} }));

import PinnedPages from './PinnedPages.svelte';

const doc = (title: string, path: string, pinned = true) =>
	({
		metaData: { title, path, slug: path.slice(1), properties: pinned ? { pinned: true } : {} }
	}) as unknown as DocumentSummary;

describe('PinnedPages (sidebar)', () => {
	beforeEach(() => localStorage.clear());
	afterEach(() => {
		cleanup();
		localStorage.clear();
	});

	it('lists pinned pages by title and marks the open one', () => {
		render(PinnedPages, {
			props: {
				documents: [doc('Zebra', '/z'), doc('Network Map', '/n'), doc('Not pinned', '/x', false)],
				currentPath: '/z'
			}
		});
		const links = screen.getAllByTestId('sidebar-pinned-link');

		expect(links.map((l) => l.textContent?.trim())).toEqual(['Network Map', 'Zebra']);
		expect(links[0]).toHaveAttribute('href', '/documents/n');
		expect(links[1]).toHaveAttribute('aria-current', 'page');
	});

	it('is not shown when nothing is pinned', () => {
		render(PinnedPages, { props: { documents: [doc('A', '/a', false)], currentPath: '' } });
		expect(screen.queryByTestId('sidebar-pinned')).not.toBeInTheDocument();
	});

	it('collapses, and remembers that', async () => {
		const { unmount } = render(PinnedPages, {
			props: { documents: [doc('A', '/a')], currentPath: '' }
		});
		await userEvent.click(screen.getByRole('button', { name: /Pinned/ }));
		expect(screen.queryByTestId('sidebar-pinned-link')).not.toBeInTheDocument();
		unmount();

		render(PinnedPages, { props: { documents: [doc('A', '/a')], currentPath: '' } });
		expect(screen.queryByTestId('sidebar-pinned-link')).not.toBeInTheDocument();
		expect(screen.getByRole('button', { name: /Pinned/ })).toHaveAttribute(
			'aria-expanded',
			'false'
		);
	});
});
