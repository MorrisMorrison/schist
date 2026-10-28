import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import type { Document, SearchHit, SearchResponse } from '#lib/api/types.ts';

vi.mock('#lib/api/client.ts', () => ({
	apiClient: { searchDocuments: vi.fn() }
}));
vi.mock('#lib/utils/markdown-cache.ts', () => ({
	getCachedDocuments: vi.fn()
}));

import { goto } from '$app/navigation';
import { apiClient } from '#lib/api/client.ts';
import { getCachedDocuments } from '#lib/utils/markdown-cache.ts';
import { pressOutsideDialog, waitForDialogFocus } from '#lib/test/dialog.ts';
import QuickSwitcher from './QuickSwitcher.svelte';

function doc(title: string, path: string, tags: string[] = []): Document {
	return { metaData: { title, path, slug: path.split('/').pop(), tags }, content: '' };
}

function hit(title: string, path: string, extra: Partial<SearchHit> = {}): SearchHit {
	return { title, path, tags: [], matchedIn: 'title', score: 1, ...extra };
}

function respond(...hits: SearchHit[]): SearchResponse {
	return { query: '', results: hits, total: hits.length };
}

const alphaHit = hit('Alpha Plan', '/projects/alpha-plan', {
	tags: ['work', 'q3', 'draft'],
	matchedIn: 'content',
	snippet: [
		{ text: '…the ' },
		{ text: 'alpha', match: true },
		{ text: ' launch slips to <b>May</b>…' }
	]
});
const soupHit = hit('Alphabet Soup', '/recipes/alphabet-soup');

function results() {
	return screen.queryAllByTestId('quick-switcher-result');
}

async function type(value: string) {
	await fireEvent.input(screen.getByTestId('quick-switcher-input'), { target: { value } });
}

async function typeAndWait(value: string) {
	await type(value);
	await vi.waitFor(() => expect(results().length).toBeGreaterThan(0));
}

describe('QuickSwitcher', () => {
	beforeEach(() => {
		localStorage.removeItem('recent-documents');
		vi.mocked(getCachedDocuments).mockResolvedValue([
			doc('Alpha Plan', '/projects/alpha-plan', ['work']),
			doc('Beta Notes', '/beta-notes', ['notes'])
		]);
		vi.mocked(apiClient.searchDocuments).mockResolvedValue(respond(alphaHit, soupHit));
	});

	afterEach(() => {
		cleanup();
		localStorage.removeItem('recent-documents');
		vi.clearAllMocks();
		vi.restoreAllMocks();
	});

	it('renders nothing while closed', () => {
		render(QuickSwitcher, { props: { open: false, onClose: vi.fn() } });

		expect(screen.queryByTestId('quick-switcher')).not.toBeInTheDocument();
		expect(getCachedDocuments).not.toHaveBeenCalled();
	});

	it('shows the empty recent state without loading documents', async () => {
		render(QuickSwitcher, { props: { open: true, onClose: vi.fn() } });

		expect(screen.getByText('No recent documents')).toBeInTheDocument();
		await vi.waitFor(() => expect(screen.getByTestId('quick-switcher-input')).toHaveFocus());
		expect(getCachedDocuments).not.toHaveBeenCalled();
	});

	it('lists recent documents that still exist', async () => {
		localStorage.setItem(
			'recent-documents',
			JSON.stringify(['/beta-notes', '/gone', '/projects/alpha-plan'])
		);
		render(QuickSwitcher, { props: { open: true, onClose: vi.fn() } });

		expect(await screen.findByText('Recent Documents')).toBeInTheDocument();
		expect(results().map((r) => r.textContent)).toEqual([
			expect.stringContaining('Beta Notes'),
			expect.stringContaining('Alpha Plan')
		]);
		expect(screen.queryByTestId('quick-switcher-snippet')).not.toBeInTheDocument();
	});

	it('searches the API as you type and shows folder, tags and the snippet', async () => {
		render(QuickSwitcher, { props: { open: true, onClose: vi.fn() } });

		await typeAndWait('alpha');

		expect(apiClient.searchDocuments).toHaveBeenCalledWith('alpha', 10);
		expect(results().map((r) => r.textContent)).toEqual([
			expect.stringContaining('Alpha Plan'),
			expect.stringContaining('Alphabet Soup')
		]);
		const alpha = results()[0];
		expect(alpha).toHaveTextContent('projects');
		expect(alpha).toHaveTextContent('work');
		expect(alpha).toHaveTextContent('+1');

		const snippet = screen.getByTestId('quick-switcher-snippet');
		expect(snippet).toHaveTextContent('…the alpha launch slips to <b>May</b>…');
		expect([...snippet.querySelectorAll('mark')].map((m) => m.textContent)).toEqual(['alpha']);
		expect(snippet.querySelector('b')).toBeNull(); // snippet text is never HTML
	});

	it('debounces typing into one request', async () => {
		render(QuickSwitcher, { props: { open: true, onClose: vi.fn() } });

		await type('a');
		await type('al');
		await typeAndWait('alp');

		expect(apiClient.searchDocuments).toHaveBeenCalledTimes(1);
		expect(apiClient.searchDocuments).toHaveBeenCalledWith('alp', 10);
	});

	it('ignores a slow response to an older query', async () => {
		let resolveOld!: (value: SearchResponse) => void;
		vi.mocked(apiClient.searchDocuments)
			.mockImplementationOnce(() => new Promise((resolve) => (resolveOld = resolve)))
			.mockResolvedValueOnce(respond(soupHit));
		render(QuickSwitcher, { props: { open: true, onClose: vi.fn() } });

		await type('old');
		await vi.waitFor(() => expect(apiClient.searchDocuments).toHaveBeenCalledTimes(1));
		await typeAndWait('soup');
		resolveOld(respond(alphaHit));
		await new Promise((resolve) => setTimeout(resolve, 20));

		expect(results().map((r) => r.textContent)).toEqual([expect.stringContaining('Alphabet Soup')]);
	});

	it('shows a no-results message for an unknown query', async () => {
		vi.mocked(apiClient.searchDocuments).mockResolvedValue(respond());
		render(QuickSwitcher, { props: { open: true, onClose: vi.fn() } });

		await type('zzzzqqq');

		expect(await screen.findByText('No documents found')).toBeInTheDocument();
	});

	it('moves the selection with the arrow keys and opens it with Enter', async () => {
		const onClose = vi.fn();
		render(QuickSwitcher, { props: { open: true, onClose } });
		await typeAndWait('alpha');
		const input = screen.getByTestId('quick-switcher-input');
		expect(results()[0]).toHaveClass('bg-accent');

		await fireEvent.keyDown(input, { key: 'ArrowDown' });
		expect(results()[1]).toHaveClass('bg-accent');
		expect(results()[0]).not.toHaveClass('bg-accent');

		// Clamped at both ends.
		await fireEvent.keyDown(input, { key: 'ArrowDown' });
		expect(results()[1]).toHaveClass('bg-accent');
		await fireEvent.keyDown(input, { key: 'ArrowUp' });
		await fireEvent.keyDown(input, { key: 'ArrowUp' });
		expect(results()[0]).toHaveClass('bg-accent');

		await fireEvent.keyDown(input, { key: 'ArrowDown' });
		await fireEvent.keyDown(input, { key: 'Enter' });

		expect(goto).toHaveBeenCalledWith('/documents/recipes/alphabet-soup');
		expect(onClose).toHaveBeenCalled();
		expect(JSON.parse(localStorage.getItem('recent-documents')!)).toContain(
			'/recipes/alphabet-soup'
		);
	});

	it('Enter with no results does nothing', async () => {
		const onClose = vi.fn();
		render(QuickSwitcher, { props: { open: true, onClose } });

		await fireEvent.keyDown(screen.getByTestId('quick-switcher-input'), { key: 'Enter' });

		expect(goto).not.toHaveBeenCalled();
		expect(onClose).not.toHaveBeenCalled();
	});

	it('opens a clicked result and highlights on hover', async () => {
		const onClose = vi.fn();
		render(QuickSwitcher, { props: { open: true, onClose } });
		await typeAndWait('alpha');
		const result = results()[1];

		await fireEvent.mouseEnter(result);
		expect(result).toHaveClass('bg-accent');
		await fireEvent.click(result);

		expect(goto).toHaveBeenCalledWith('/documents/recipes/alphabet-soup');
		expect(onClose).toHaveBeenCalled();
	});

	it('closes with Escape on the input and on the dialog', async () => {
		const onClose = vi.fn();
		render(QuickSwitcher, { props: { open: true, onClose } });

		await fireEvent.keyDown(screen.getByTestId('quick-switcher-input'), { key: 'Escape' });
		expect(onClose).toHaveBeenCalled();

		// A fresh dialog: the parent would have closed this one.
		cleanup();
		onClose.mockClear();
		render(QuickSwitcher, { props: { open: true, onClose } });
		await fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('closes on a press outside the panel, not on a click inside it', async () => {
		const onClose = vi.fn();
		render(QuickSwitcher, { props: { open: true, onClose } });
		await waitForDialogFocus();

		await fireEvent.click(screen.getByTestId('quick-switcher'));
		expect(onClose).not.toHaveBeenCalled();

		await pressOutsideDialog();
		await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
	});

	it('copes with the search failing', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.mocked(apiClient.searchDocuments).mockRejectedValue(new Error('offline'));
		render(QuickSwitcher, { props: { open: true, onClose: vi.fn() } });

		await type('alpha');

		expect(await screen.findByText('No documents found')).toBeInTheDocument();
		expect(console.error).toHaveBeenCalled();
	});

	it('copes with the recent documents failing to load', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		localStorage.setItem('recent-documents', JSON.stringify(['/beta-notes']));
		vi.mocked(getCachedDocuments).mockRejectedValue(new Error('offline'));
		render(QuickSwitcher, { props: { open: true, onClose: vi.fn() } });

		await vi.waitFor(() => expect(console.error).toHaveBeenCalled());
		expect(screen.getByText('No recent documents')).toBeInTheDocument();
	});

	it('clears the results when the query is emptied', async () => {
		render(QuickSwitcher, { props: { open: true, onClose: vi.fn() } });
		await typeAndWait('alpha');

		await type('');

		expect(await screen.findByText('No recent documents')).toBeInTheDocument();
	});
});
