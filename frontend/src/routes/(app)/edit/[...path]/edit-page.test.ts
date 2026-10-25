import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import type { Document, UpdateDocumentRequest } from '$lib/api/types';
import { documentActions } from '$lib/stores/documents.svelte';
import EditPage from './+page.svelte';

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

const AUTO_SAVE_MS = 10000;

function makeDocument(path: string, title: string, body = 'Body text'): Document {
	return {
		metaData: { title, path, slug: path.split('/').pop(), tags: [] },
		content: `# ${title}\n\n${body}`
	};
}

function pageData(document: Document) {
	return { document, path: document.metaData.path } as never;
}

async function typeInEditor(value: string) {
	await fireEvent.input(screen.getByTestId('editor-stub'), { target: { value } });
}

describe('Edit page', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.mocked(documentActions.checkDocumentExists).mockResolvedValue(false);
		// The backend echoes the saved document back with its (possibly new) path.
		vi.mocked(documentActions.updateDocumentByPath).mockImplementation(
			async (_path: string, req: UpdateDocumentRequest) =>
				({ metaData: { ...req.metaData }, content: req.content }) as Document
		);
	});

	afterEach(() => {
		cleanup();
		vi.useRealTimers();
		vi.clearAllMocks();
	});

	it('auto-saves to the new path after an auto-save renamed the document', async () => {
		render(EditPage, { props: { data: pageData(makeDocument('notes/old-title', 'Old Title')) } });

		await typeInEditor('# New Title\n\nBody text');
		await vi.advanceTimersByTimeAsync(AUTO_SAVE_MS);

		const update = vi.mocked(documentActions.updateDocumentByPath);
		expect(update).toHaveBeenCalledTimes(1);
		expect(update.mock.calls[0][0]).toBe('notes/old-title');
		expect(update.mock.calls[0][1].metaData.path).toBe('notes/new-title');

		await typeInEditor('# New Title\n\nMore body text');
		await vi.advanceTimersByTimeAsync(AUTO_SAVE_MS);

		expect(update).toHaveBeenCalledTimes(2);
		expect(update.mock.calls[1][0]).toBe('notes/new-title');
		expect(update.mock.calls[1][1].metaData.path).toBe('notes/new-title');
		expect(screen.getByText('/notes/new-title')).toBeInTheDocument();
	});

	it('loads the new document when navigating from one edit page to another', async () => {
		const { rerender } = render(EditPage, {
			props: { data: pageData(makeDocument('notes/a', 'Doc A', 'Alpha body')) }
		});
		expect(screen.getByTestId('editor-stub')).toHaveValue('# Doc A\n\nAlpha body');

		// Unsaved edit on A, then SvelteKit reuses the page component for /edit/notes/b.
		await typeInEditor('# Doc A\n\nAlpha body, edited');
		await rerender({ data: pageData(makeDocument('notes/b', 'Doc B', 'Beta body')) });

		expect(screen.getByTestId('editor-stub')).toHaveValue('# Doc B\n\nBeta body');
		expect(screen.getByRole('heading', { name: 'Doc B' })).toBeInTheDocument();
		expect(screen.getByText('/notes/b')).toBeInTheDocument();

		// A's pending auto-save timer must not fire against B (or A) after the switch.
		await vi.advanceTimersByTimeAsync(AUTO_SAVE_MS);
		expect(documentActions.updateDocumentByPath).not.toHaveBeenCalled();
	});
});
