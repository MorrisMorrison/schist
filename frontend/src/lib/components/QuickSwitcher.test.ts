import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import type { Document } from '$lib/api/types';

vi.mock('$lib/api/client', () => ({
	apiClient: { getDocuments: vi.fn() }
}));

import { goto } from '$app/navigation';
import { apiClient } from '$lib/api/client';
import { pressOutsideDialog, waitForDialogFocus } from '$lib/test/dialog';
import QuickSwitcher from './QuickSwitcher.svelte';

function doc(title: string, path: string, tags: string[] = []): Document {
	return { metaData: { title, path, slug: path.split('/').pop(), tags }, content: '' };
}

const docs = [
	doc('Alpha Plan', '/projects/alpha-plan', ['work', 'q3', 'draft']),
	doc('Beta Notes', '/beta-notes', ['notes']),
	doc('Alphabet Soup', '/recipes/alphabet-soup')
];

function results() {
	return screen.queryAllByTestId('quick-switcher-result');
}

async function type(value: string) {
	await fireEvent.input(screen.getByTestId('quick-switcher-input'), { target: { value } });
	await vi.waitFor(() => expect(results().length).toBeGreaterThan(0));
}

describe('QuickSwitcher', () => {
	beforeEach(() => {
		localStorage.removeItem('recent-documents');
		vi.mocked(apiClient.getDocuments).mockResolvedValue(docs);
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
		expect(apiClient.getDocuments).not.toHaveBeenCalled();
	});

	it('shows the empty recent state and focuses the input', async () => {
		render(QuickSwitcher, { props: { open: true, onClose: vi.fn() } });

		expect(screen.getByText('No recent documents')).toBeInTheDocument();
		await vi.waitFor(() => expect(screen.getByTestId('quick-switcher-input')).toHaveFocus());
		expect(apiClient.getDocuments).toHaveBeenCalled();
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
	});

	it('searches as you type and shows folder and tags', async () => {
		render(QuickSwitcher, { props: { open: true, onClose: vi.fn() } });
		await vi.waitFor(() => expect(apiClient.getDocuments).toHaveBeenCalled());

		await type('alpha');

		const titles = results().map((r) => r.textContent ?? '');
		expect(titles.some((t) => t.includes('Alpha Plan'))).toBe(true);
		expect(titles.some((t) => t.includes('Beta Notes'))).toBe(false);
		const alpha = results().find((r) => r.textContent?.includes('Alpha Plan'))!;
		expect(alpha).toHaveTextContent('projects');
		expect(alpha).toHaveTextContent('work');
		expect(alpha).toHaveTextContent('+1');
	});

	it('shows a no-results message for an unknown query', async () => {
		render(QuickSwitcher, { props: { open: true, onClose: vi.fn() } });
		await vi.waitFor(() => expect(apiClient.getDocuments).toHaveBeenCalled());

		await fireEvent.input(screen.getByTestId('quick-switcher-input'), {
			target: { value: 'zzzzqqq' }
		});

		expect(await screen.findByText('No documents found')).toBeInTheDocument();
	});

	it('moves the selection with the arrow keys and opens it with Enter', async () => {
		const onClose = vi.fn();
		render(QuickSwitcher, { props: { open: true, onClose } });
		await vi.waitFor(() => expect(apiClient.getDocuments).toHaveBeenCalled());
		await type('alpha');
		const input = screen.getByTestId('quick-switcher-input');
		const count = results().length;
		expect(count).toBeGreaterThan(1);
		expect(results()[0]).toHaveClass('bg-accent');

		await fireEvent.keyDown(input, { key: 'ArrowDown' });
		expect(results()[1]).toHaveClass('bg-accent');
		expect(results()[0]).not.toHaveClass('bg-accent');

		// Clamped at the last result.
		for (let i = 0; i < count + 2; i++) await fireEvent.keyDown(input, { key: 'ArrowDown' });
		expect(results()[count - 1]).toHaveClass('bg-accent');

		for (let i = 0; i < count + 2; i++) await fireEvent.keyDown(input, { key: 'ArrowUp' });
		expect(results()[0]).toHaveClass('bg-accent');

		await fireEvent.keyDown(input, { key: 'ArrowDown' });
		const selectedTitle = results()[1].textContent ?? '';
		const selected = docs.find((d) => selectedTitle.includes(d.metaData.title))!;

		await fireEvent.keyDown(input, { key: 'Enter' });

		expect(goto).toHaveBeenCalledWith(`/documents${selected.metaData.path}`);
		expect(onClose).toHaveBeenCalled();
		expect(JSON.parse(localStorage.getItem('recent-documents')!)).toContain(selected.metaData.path);
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
		await vi.waitFor(() => expect(apiClient.getDocuments).toHaveBeenCalled());
		await type('beta');
		const result = results()[0];

		await fireEvent.mouseEnter(result);
		expect(result).toHaveClass('bg-accent');
		await fireEvent.click(result);

		expect(goto).toHaveBeenCalledWith('/documents/beta-notes');
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

	it('copes with the document list failing to load', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.mocked(apiClient.getDocuments).mockRejectedValue(new Error('offline'));
		render(QuickSwitcher, { props: { open: true, onClose: vi.fn() } });

		await vi.waitFor(() => expect(console.error).toHaveBeenCalled());
		await fireEvent.input(screen.getByTestId('quick-switcher-input'), {
			target: { value: 'alpha' }
		});
		expect(await screen.findByText('No documents found')).toBeInTheDocument();
	});

	it('warns when no documents come back', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.mocked(apiClient.getDocuments).mockResolvedValue([]);
		render(QuickSwitcher, { props: { open: true, onClose: vi.fn() } });

		await vi.waitFor(() => expect(warn).toHaveBeenCalled());
	});

	it('clears the results when the query is emptied', async () => {
		render(QuickSwitcher, { props: { open: true, onClose: vi.fn() } });
		await vi.waitFor(() => expect(apiClient.getDocuments).toHaveBeenCalled());
		await type('alpha');

		await fireEvent.input(screen.getByTestId('quick-switcher-input'), { target: { value: '' } });

		expect(await screen.findByText('No recent documents')).toBeInTheDocument();
	});
});
