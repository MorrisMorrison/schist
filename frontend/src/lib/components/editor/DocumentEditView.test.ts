import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import type { Document, UpdateDocumentRequest } from '$lib/api/types';

vi.mock('$lib/components/editor/LazyEditor.svelte', async () => ({
	default: (await import('$lib/test/EditorStub.svelte')).default
}));

vi.mock('$lib/stores/documents.svelte', () => ({
	documentActions: {
		updateDocumentByPath: vi.fn(),
		checkDocumentExists: vi.fn(),
		deleteDocumentByPath: vi.fn()
	}
}));

import { beforeNavigate, goto, replaceState } from '$app/navigation';
import { documentActions } from '$lib/stores/documents.svelte';
import DocumentEditView from './DocumentEditView.svelte';
import MarkdownInfoHelp from './MarkdownInfoHelp.svelte';

const AUTO_SAVE_MS = 10000;

function makeDocument(title = 'Plan', body = 'Body'): Document {
	return {
		metaData: { title, path: 'notes/plan', slug: 'plan', tags: [] },
		content: `# ${title}\n\n${body}`
	};
}

function renderView(document: Document | null = makeDocument()) {
	return render(DocumentEditView, { props: { document, path: 'notes/plan' } });
}

async function typeInEditor(value: string) {
	await fireEvent.input(screen.getByTestId('editor-stub'), { target: { value } });
}

const saveButton = () => screen.getByTestId('save-document-button');

describe('DocumentEditView', () => {
	beforeEach(() => {
		vi.mocked(documentActions.checkDocumentExists).mockResolvedValue(false);
		vi.mocked(documentActions.updateDocumentByPath).mockImplementation(
			async (_path: string, req: UpdateDocumentRequest) =>
				({ metaData: { ...req.metaData }, content: req.content }) as Document
		);
	});

	afterEach(() => {
		cleanup();
		vi.useRealTimers();
		vi.clearAllMocks();
		vi.restoreAllMocks();
	});

	it('shows the title from the content and the path being edited', () => {
		renderView();

		expect(screen.getByRole('heading', { level: 1, name: 'Plan' })).toBeInTheDocument();
		expect(screen.getByText('/notes/plan')).toBeInTheDocument();
		expect(screen.getByTestId('cancel-button')).toHaveAttribute('href', '/documents/notes/plan');
		expect(screen.getByText('Markdown Tips')).toBeInTheDocument();
	});

	it('copes with a missing document', () => {
		renderView(null);

		expect(saveButton()).toBeDisabled();
	});

	it('saves, extracting tags, and opens the document', async () => {
		renderView();
		await typeInEditor('# Plan\n\nBody with #work');

		await fireEvent.click(saveButton());

		await vi.waitFor(() => expect(goto).toHaveBeenCalledWith('/documents/notes/plan'));
		const [path, req, mode] = vi.mocked(documentActions.updateDocumentByPath).mock.calls[0];
		expect(path).toBe('notes/plan');
		expect(mode).toBe('manual');
		expect(req.metaData).toMatchObject({ title: 'Plan', path: 'notes/plan', tags: ['work'] });
		expect(req.content).toBe('# Plan\n\nBody with #work');
		expect(documentActions.checkDocumentExists).not.toHaveBeenCalledWith('notes/plan');
	});

	it('renames on save when the title changed', async () => {
		renderView();
		await typeInEditor('# Kickoff\n\nBody');

		await fireEvent.click(saveButton());

		await vi.waitFor(() => expect(goto).toHaveBeenCalledWith('/documents/notes/kickoff'));
		expect(documentActions.checkDocumentExists).toHaveBeenCalledWith('notes/kickoff');
		expect(vi.mocked(documentActions.updateDocumentByPath).mock.calls[0][1].metaData.path).toBe(
			'notes/kickoff'
		);
	});

	it('refuses to rename onto an existing document', async () => {
		vi.mocked(documentActions.checkDocumentExists).mockResolvedValue(true);
		renderView();
		await typeInEditor('# Taken\n\nBody');

		// The debounced existence check flags the clash and disables saving.
		expect(
			await screen.findByText(/A document already exists at "notes\/taken"/, {}, { timeout: 2000 })
		).toBeInTheDocument();
		expect(saveButton()).toBeDisabled();
	});

	it('shows the clash on save if the debounce has not fired yet', async () => {
		renderView();
		await typeInEditor('# Taken\n\nBody');
		vi.mocked(documentActions.checkDocumentExists).mockResolvedValue(true);

		await fireEvent.click(saveButton());

		expect(await screen.findByText(/already exists at "notes\/taken"/)).toBeInTheDocument();
		expect(documentActions.updateDocumentByPath).not.toHaveBeenCalled();
	});

	it('dismisses the existence warning', async () => {
		vi.mocked(documentActions.checkDocumentExists).mockResolvedValue(true);
		renderView();
		await typeInEditor('# Taken\n\nBody');
		const warning = await screen.findByText(/already exists/, {}, { timeout: 2000 });

		await fireEvent.click(warning.closest('[role="alert"]')!.querySelector('button')!);

		expect(screen.queryByText(/already exists/)).not.toBeInTheDocument();
	});

	it('shows an error when the save fails', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.mocked(documentActions.updateDocumentByPath).mockRejectedValue(new Error('Disk full'));
		renderView();
		await typeInEditor('# Plan\n\nChanged');

		await fireEvent.click(saveButton());

		expect(await screen.findByText('Disk full')).toBeInTheDocument();
		expect(goto).not.toHaveBeenCalled();
		await fireEvent.click(
			screen.getByText('Disk full').closest('[role="alert"]')!.querySelector('button')!
		);
		expect(screen.queryByText('Disk full')).not.toBeInTheDocument();
	});

	it('disables saving empty content', async () => {
		renderView();
		await typeInEditor('   ');

		expect(saveButton()).toBeDisabled();
	});

	it('auto-saves after ten seconds and follows a rename', async () => {
		vi.useFakeTimers();
		renderView();
		await typeInEditor('# Renamed\n\nBody');

		await vi.advanceTimersByTimeAsync(AUTO_SAVE_MS);

		expect(documentActions.updateDocumentByPath).toHaveBeenCalledTimes(1);
		expect(vi.mocked(documentActions.updateDocumentByPath).mock.calls[0][2]).toBe('auto');
		expect(replaceState).toHaveBeenCalledWith('/edit/notes/renamed', {});
		expect(screen.getByText('/notes/renamed')).toBeInTheDocument();
	});

	it('does not auto-save when the content is back to the original', async () => {
		vi.useFakeTimers();
		renderView();
		await typeInEditor('# Plan\n\nChanged');
		await typeInEditor('# Plan\n\nBody');

		await vi.advanceTimersByTimeAsync(AUTO_SAVE_MS);

		expect(documentActions.updateDocumentByPath).not.toHaveBeenCalled();
	});

	it('reports a failed auto-save', async () => {
		vi.useFakeTimers();
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.mocked(documentActions.updateDocumentByPath).mockRejectedValue(new Error('offline'));
		renderView();
		await typeInEditor('# Plan\n\nChanged');

		await vi.advanceTimersByTimeAsync(AUTO_SAVE_MS);

		expect(screen.getByText('offline')).toBeInTheDocument();
	});

	it('reports empty content on auto-save', async () => {
		vi.useFakeTimers();
		renderView();
		await typeInEditor(' ');

		await vi.advanceTimersByTimeAsync(AUTO_SAVE_MS);

		expect(screen.getByText('Content is required')).toBeInTheDocument();
	});

	it('deletes the document after confirmation and goes home', async () => {
		vi.mocked(documentActions.deleteDocumentByPath).mockResolvedValue(undefined as never);
		renderView();

		await fireEvent.click(screen.getByTestId('delete-document-button'));
		await fireEvent.click(await screen.findByTestId('confirm-delete-button'));

		await vi.waitFor(() => expect(goto).toHaveBeenCalledWith('/'));
		expect(documentActions.deleteDocumentByPath).toHaveBeenCalledWith('notes/plan');
	});

	it('shows an error when deleting fails', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.mocked(documentActions.deleteDocumentByPath).mockRejectedValue(new Error('locked'));
		renderView();

		await fireEvent.click(screen.getByTestId('delete-document-button'));
		await fireEvent.click(await screen.findByTestId('confirm-delete-button'));

		expect(await screen.findByText('locked')).toBeInTheDocument();
		expect(goto).not.toHaveBeenCalled();
	});

	it('closes the delete dialog with Cancel or Escape', async () => {
		renderView();

		await fireEvent.click(screen.getByTestId('delete-document-button'));
		await fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
		await vi.waitFor(() =>
			expect(screen.queryByTestId('confirm-delete-button')).not.toBeInTheDocument()
		);

		await fireEvent.click(screen.getByTestId('delete-document-button'));
		await screen.findByTestId('confirm-delete-button');
		await fireEvent.keyDown(window, { key: 'Escape' });
		await vi.waitFor(() =>
			expect(screen.queryByTestId('confirm-delete-button')).not.toBeInTheDocument()
		);
		expect(documentActions.deleteDocumentByPath).not.toHaveBeenCalled();
	});

	it('asks about unsaved changes before navigating away', async () => {
		renderView();
		await typeInEditor('# Plan\n\nUnsaved');
		const guard = vi.mocked(beforeNavigate).mock.calls.at(-1)![0];
		const cancel = vi.fn();

		guard({ cancel, to: { url: new URL('http://localhost/') } } as never);

		expect(cancel).toHaveBeenCalled();
		expect(await screen.findByRole('dialog')).toHaveTextContent(/unsaved changes/i);

		await fireEvent.keyDown(window, { key: 'Escape' });
		await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
	});

	it('lets a clean document navigate away', () => {
		renderView();
		const guard = vi.mocked(beforeNavigate).mock.calls.at(-1)![0];
		const cancel = vi.fn();

		guard({ cancel, to: { url: new URL('http://localhost/') } } as never);

		expect(cancel).not.toHaveBeenCalled();
	});

	it('warns before unloading with unsaved changes', async () => {
		renderView();
		await typeInEditor('# Plan\n\nUnsaved');
		const event = new Event('beforeunload', { cancelable: true });

		window.dispatchEvent(event);

		expect(event.defaultPrevented).toBe(true);
	});
});

describe('MarkdownInfoHelp', () => {
	afterEach(() => cleanup());

	it('lists the markdown tips, with the task example on request', () => {
		render(MarkdownInfoHelp);
		expect(screen.getByText('# Heading')).toBeInTheDocument();
		expect(screen.queryByText('- [ ] Task')).not.toBeInTheDocument();
		cleanup();

		render(MarkdownInfoHelp, { props: { showTaskExample: true } });
		expect(screen.getByText('- [ ] Task')).toBeInTheDocument();
	});
});
