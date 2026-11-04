import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import type { DocumentSummary } from '#lib/api/types.ts';

vi.mock('#lib/api/client.ts', () => ({
	apiClient: { getDocuments: vi.fn() }
}));
vi.mock('#lib/utils/pins.ts', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/utils/pins.ts')>()),
	setPinned: vi.fn().mockResolvedValue(undefined)
}));

import { apiClient } from '#lib/api/client.ts';
import { setPinned } from '#lib/utils/pins.ts';
import HomeView from './HomeView.svelte';

const NOW = new Date('2026-11-04T12:00:00Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60000).toISOString();

const doc = (
	title: string,
	path: string,
	updated: string,
	properties?: Record<string, unknown>
): DocumentSummary =>
	({
		metaData: { title, path, slug: path.split('/').pop(), updated, properties }
	}) as DocumentSummary;

const docs = [
	doc('Service & Port Registry', '/homelab/registry', minutesAgo(60 * 30), { pinned: true }),
	doc('Network Map', '/homelab/network', minutesAgo(60 * 50), { pinned: true }),
	doc('Runbook — Add a DNS record', '/homelab/runbooks/dns', minutesAgo(3)),
	doc('rami — Desktop PC', '/homelab/devices/rami', minutesAgo(90)),
	doc('Root note', '/root-note', minutesAgo(10))
];

describe('HomeView', () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(NOW);
		localStorage.clear();
		vi.mocked(apiClient.getDocuments).mockResolvedValue(docs);
		vi.mocked(setPinned).mockClear();
	});
	afterEach(() => {
		cleanup();
		vi.useRealTimers();
		localStorage.clear();
	});

	it('has a title and a way to start a new page', async () => {
		render(HomeView);
		expect(screen.getByRole('heading', { level: 1, name: 'Home' })).toBeInTheDocument();
		expect(screen.getByTestId('create-document')).toHaveAttribute('href', '/new');
	});

	it('shows pinned pages as tiles, sorted by title, with their folder', async () => {
		render(HomeView);
		const tiles = await screen.findAllByTestId('pinned-tile');

		expect(tiles.map((t) => t.querySelector('[data-tile-title]')?.textContent)).toEqual([
			'Network Map',
			'Service & Port Registry'
		]);
		expect(tiles[0]).toHaveAttribute('href', '/documents/homelab/network');
		expect(tiles[0]).toHaveTextContent('homelab');
	});

	it('labels a pinned page at the top level as such, not "Home"', async () => {
		vi.mocked(apiClient.getDocuments).mockResolvedValue([
			doc('Root note', '/root-note', minutesAgo(1), { pinned: true })
		]);
		render(HomeView);
		// The store may still hold the previous test's pages until the list loads.
		const title = await screen.findByText('Root note', { selector: '[data-tile-title]' });
		const tile = title.closest('[data-testid="pinned-tile"]')!;
		expect(tile).toHaveTextContent('Top level');
		expect(tile).not.toHaveTextContent('Home');
	});

	it('explains how to pin when nothing is pinned', async () => {
		vi.mocked(apiClient.getDocuments).mockResolvedValue(
			docs.map((d) => ({ ...d, metaData: { ...d.metaData, properties: undefined } }))
		);
		render(HomeView);
		expect(await screen.findByText(/Pin pages from their ⋯ menu/)).toBeInTheDocument();
	});

	it('lists the pages you opened, newest first, with how long ago', async () => {
		localStorage.setItem(
			'recent-documents',
			JSON.stringify([
				{ path: '/homelab/runbooks/dns', openedAt: minutesAgo(5) },
				{ path: '/deleted/page', openedAt: minutesAgo(6) },
				{ path: '/homelab/devices/rami', openedAt: minutesAgo(60) },
				'/root-note'
			])
		);
		render(HomeView);
		const rows = await screen.findAllByTestId('recent-row');

		expect(rows.map((r) => r.querySelector('[data-row-title]')?.textContent)).toEqual([
			'Runbook — Add a DNS record',
			'rami — Desktop PC',
			'Root note'
		]);
		expect(rows[0]).toHaveTextContent('homelab/runbooks');
		expect(rows[0]).toHaveTextContent('5 min ago');
		expect(rows[1]).toHaveTextContent('1 h ago');
		expect(rows[2].querySelector('a')).toHaveAttribute('href', '/documents/root-note');
	});

	it('shows pages by last change on the Changed tab', async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		render(HomeView);
		await screen.findAllByTestId('pinned-tile');

		await user.click(screen.getByRole('tab', { name: 'Changed' }));
		const rows = await screen.findAllByTestId('recent-row');

		expect(rows.map((r) => r.querySelector('[data-row-title]')?.textContent)).toEqual([
			'Runbook — Add a DNS record',
			'Root note',
			'rami — Desktop PC',
			'Service & Port Registry',
			'Network Map'
		]);
		expect(rows[0]).toHaveTextContent('3 min ago');
	});

	it('pins and unpins from a recent row', async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		localStorage.setItem(
			'recent-documents',
			JSON.stringify([
				{ path: '/homelab/runbooks/dns', openedAt: minutesAgo(5) },
				{ path: '/homelab/registry', openedAt: minutesAgo(8) }
			])
		);
		render(HomeView);
		const rows = await screen.findAllByTestId('recent-row');

		await user.click(within(rows[0]).getByRole('button', { name: /^Pin / }));
		expect(setPinned).toHaveBeenCalledWith('/homelab/runbooks/dns', true);

		await user.click(within(rows[1]).getByRole('button', { name: /^Unpin / }));
		expect(setPinned).toHaveBeenCalledWith('/homelab/registry', false);
	});

	it('links to the full folder view with the page count', async () => {
		render(HomeView);
		const browse = await screen.findByRole('link', { name: 'Browse all' });
		expect(browse).toHaveAttribute('href', '/folders');
		expect(screen.getByTestId('home-page-count')).toHaveTextContent('5 pages');
	});
});
