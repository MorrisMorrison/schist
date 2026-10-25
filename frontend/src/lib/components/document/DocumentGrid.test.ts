import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import type { Document } from '$lib/api/types';

vi.mock('$lib/api/client', () => ({ apiClient: {} }));

vi.mock('$lib/stores/documents.svelte', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/stores/documents.svelte')>()),
	documentActions: { deleteDocument: vi.fn(), clearError: vi.fn() }
}));

import { goto } from '$app/navigation';
import { documentActions } from '$lib/stores/documents.svelte';
import DocumentGrid from './DocumentGrid.svelte';

function doc(title: string, path: string): Document {
	return {
		metaData: { title, path, slug: path.split('/').pop(), tags: [], updated: '2024-01-01' },
		content: `${title} body`
	};
}

const docs = [doc('Alpha', '/a/alpha'), doc('Beta', '/b/beta'), doc('Gamma', '/gamma')];

const cards = () => screen.getAllByTestId('document-card');
const card = (title: string) => cards().find((c) => c.textContent?.includes(title))!;

async function enableMultiSelect() {
	await fireEvent.click(screen.getByRole('switch'));
}

describe('DocumentGrid', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
		vi.restoreAllMocks();
	});

	it('renders a card per document', () => {
		render(DocumentGrid, { props: { documents: docs } });

		expect(cards()).toHaveLength(3);
		expect(card('Alpha')).toHaveTextContent('Alpha body');
	});

	it('shows a spinner while loading', () => {
		const { container } = render(DocumentGrid, { props: { documents: docs, loading: true } });

		expect(screen.queryByTestId('document-card')).not.toBeInTheDocument();
		expect(container.querySelector('.animate-spin')).not.toBeNull();
	});

	it('shows the empty state and links to a new document', async () => {
		render(DocumentGrid, { props: { documents: [], emptyMessage: 'Nothing in here.' } });

		expect(screen.getByText('No documents yet')).toBeInTheDocument();
		expect(screen.getByText('Nothing in here.')).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Create your first document' }));

		expect(goto).toHaveBeenCalledWith('/new');
	});

	it('shows an error that can be dismissed', async () => {
		render(DocumentGrid, { props: { documents: docs, error: 'Could not load' } });

		expect(screen.getByText('Could not load')).toBeInTheDocument();
		await fireEvent.click(within(screen.getByRole('alert')).getByRole('button'));

		expect(documentActions.clearError).toHaveBeenCalled();
	});

	it('views and edits documents', async () => {
		render(DocumentGrid, { props: { documents: docs } });

		await fireEvent.click(card('Alpha'));
		expect(goto).toHaveBeenCalledWith('/documents/a/alpha');

		await fireEvent.click(within(card('Beta')).getByTitle('Edit document'));
		expect(goto).toHaveBeenCalledWith('/edit/b/beta');
	});

	it('deletes a document after confirmation', async () => {
		vi.mocked(documentActions.deleteDocument).mockResolvedValue(undefined as never);
		render(DocumentGrid, { props: { documents: docs } });

		await fireEvent.click(within(card('Gamma')).getByTitle('Delete document'));
		expect(await screen.findByText('Delete Document')).toBeInTheDocument();
		await fireEvent.click(screen.getByTestId('confirm-delete-button'));

		expect(documentActions.deleteDocument).toHaveBeenCalledWith('/gamma');
		await vi.waitFor(() => expect(screen.queryByText('Delete Document')).not.toBeInTheDocument());
	});

	it('keeps the dialog open when deleting fails', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.mocked(documentActions.deleteDocument).mockRejectedValue(new Error('nope'));
		render(DocumentGrid, { props: { documents: docs } });

		await fireEvent.click(within(card('Gamma')).getByTitle('Delete document'));
		await fireEvent.click(await screen.findByTestId('confirm-delete-button'));

		await vi.waitFor(() => expect(console.error).toHaveBeenCalled());
		expect(screen.getByText('Delete Document')).toBeInTheDocument();
	});

	it('cancels a delete', async () => {
		render(DocumentGrid, { props: { documents: docs } });

		await fireEvent.click(within(card('Gamma')).getByTitle('Delete document'));
		await fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

		await vi.waitFor(() => expect(screen.queryByText('Delete Document')).not.toBeInTheDocument());
		expect(documentActions.deleteDocument).not.toHaveBeenCalled();
	});

	it('hides the multi-select toggle unless asked for', () => {
		render(DocumentGrid, { props: { documents: docs } });

		expect(screen.queryByRole('switch')).not.toBeInTheDocument();
	});

	describe('multi-select', () => {
		it('selects cards, reports the selection and selects or clears all', async () => {
			const onSelectionChange = vi.fn();
			render(DocumentGrid, {
				props: { documents: docs, showMultiSelectToggle: true, onSelectionChange }
			});
			await enableMultiSelect();

			await fireEvent.click(card('Alpha'));
			expect(goto).not.toHaveBeenCalled();
			expect(screen.getByText('1 document selected')).toBeInTheDocument();
			expect(onSelectionChange).toHaveBeenLastCalledWith(['/a/alpha']);

			await fireEvent.click(card('Beta'));
			expect(screen.getByText('2 documents selected')).toBeInTheDocument();

			await fireEvent.click(card('Beta'));
			expect(screen.getByText('1 document selected')).toBeInTheDocument();

			await fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
			expect(screen.getByText('3 documents selected')).toBeInTheDocument();
			expect(onSelectionChange).toHaveBeenLastCalledWith(['/a/alpha', '/b/beta', '/gamma']);

			await fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
			expect(screen.queryByText(/selected$/)).not.toBeInTheDocument();
		});

		it('clears the selection when multi-select is switched off', async () => {
			render(DocumentGrid, { props: { documents: docs, showMultiSelectToggle: true } });
			await enableMultiSelect();
			await fireEvent.click(card('Alpha'));

			await enableMultiSelect();

			expect(screen.queryByText(/selected$/)).not.toBeInTheDocument();
			await fireEvent.click(card('Alpha'));
			expect(goto).toHaveBeenCalledWith('/documents/a/alpha');
		});

		it('bulk-deletes the selected documents', async () => {
			vi.mocked(documentActions.deleteDocument).mockResolvedValue(undefined as never);
			render(DocumentGrid, { props: { documents: docs, showMultiSelectToggle: true } });
			await enableMultiSelect();
			await fireEvent.click(card('Alpha'));
			await fireEvent.click(card('Gamma'));

			await fireEvent.click(screen.getByRole('button', { name: 'Delete (2)' }));
			expect(await screen.findByText('Delete Multiple Documents')).toBeInTheDocument();
			await fireEvent.click(screen.getByRole('button', { name: 'Delete 2 documents' }));

			expect(documentActions.deleteDocument).toHaveBeenCalledWith('/a/alpha');
			expect(documentActions.deleteDocument).toHaveBeenCalledWith('/gamma');
			await vi.waitFor(() => expect(screen.queryByText(/selected$/)).not.toBeInTheDocument());
		});

		it('keeps the selection when the bulk delete fails, and cancels', async () => {
			vi.spyOn(console, 'error').mockImplementation(() => {});
			vi.mocked(documentActions.deleteDocument).mockRejectedValue(new Error('nope'));
			render(DocumentGrid, { props: { documents: docs, showMultiSelectToggle: true } });
			await enableMultiSelect();
			await fireEvent.click(card('Beta'));

			await fireEvent.click(screen.getByRole('button', { name: 'Delete (1)' }));
			await fireEvent.click(await screen.findByRole('button', { name: 'Delete 1 document' }));
			await vi.waitFor(() => expect(console.error).toHaveBeenCalled());
			expect(screen.getByText('1 document selected')).toBeInTheDocument();

			await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
			await vi.waitFor(() =>
				expect(screen.queryByText('Delete Multiple Documents')).not.toBeInTheDocument()
			);
		});

		it('defers to a controlled multi-select mode', async () => {
			const onMultiSelectModeChange = vi.fn();
			const { rerender } = render(DocumentGrid, {
				props: {
					documents: docs,
					showMultiSelectToggle: true,
					multiSelectMode: false,
					onMultiSelectModeChange
				}
			});

			await enableMultiSelect();
			expect(onMultiSelectModeChange).toHaveBeenCalledWith(true);
			await fireEvent.click(card('Alpha'));
			expect(goto).toHaveBeenCalledWith('/documents/a/alpha');

			await rerender({ multiSelectMode: true });
			await fireEvent.click(card('Alpha'));
			expect(screen.getByText('1 document selected')).toBeInTheDocument();
		});
	});
});
