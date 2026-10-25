import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { flushSync } from 'svelte';
import type { Document, DocumentVersion, WikiLink } from '$lib/api/types';

const pageState = vi.hoisted(() => ({ url: new URL('http://localhost/documents/notes/plan') }));
vi.mock('$app/state', () => ({ page: pageState }));

vi.mock('$lib/api/client', () => ({
	apiClient: {
		getDocumentVersions: vi.fn(),
		getDocumentBacklinks: vi.fn(),
		getDocumentOutgoingLinks: vi.fn(),
		restoreDocumentToVersion: vi.fn(),
		getDocuments: vi.fn(),
		getDocumentByPath: vi.fn(),
		getAssetUrl: vi.fn((path: string) => path),
		getSecretsStatus: vi.fn(),
		getSecret: vi.fn(),
		exportDocument: vi.fn()
	}
}));

vi.mock('$lib/components/VersionHistoryModal.svelte', async () => ({
	default: (await import('$lib/test/stub-component')).namedStub('VersionHistoryModal')
}));
vi.mock('$lib/components/modal/ShareDocumentModal.svelte', async () => ({
	default: (await import('$lib/test/stub-component')).namedStub('ShareDocumentModal')
}));
vi.mock('$lib/components/document/LazyDocumentGraphView.svelte', async () => ({
	default: (await import('$lib/test/stub-component')).namedStub('GraphView')
}));
vi.mock('$lib/components/editor/DocumentInlineEditor.svelte', async () => ({
	default: (await import('$lib/test/InlineEditorStub.svelte')).default
}));

import { goto } from '$app/navigation';
import { apiClient } from '$lib/api/client';
import { resetAllState } from '$lib/stores/documents.svelte';
import { secretStore } from '$lib/stores/secrets.svelte';
import { stubProps } from '$lib/test/stub-registry';
import { waitForPointerEvents } from '$lib/test/dialog';
import { inlineEditorStub } from '$lib/test/inline-editor-stub';
import DocumentView from './DocumentView.svelte';

function makeDoc(
	overrides: Partial<Document['metaData']> = {},
	content = '# Plan\n\nHello world'
): Document {
	return {
		metaData: {
			title: 'Plan',
			path: '/notes/plan',
			slug: 'plan',
			created: '2024-01-02T10:00:00Z',
			updated: '2024-03-04T10:00:00Z',
			tags: ['work', 'q3'],
			...overrides
		},
		content
	};
}

const backlink: Document = {
	metaData: { title: 'Roadmap', path: '/notes/roadmap', slug: 'roadmap', updated: '2024-02-01' },
	content: 'The roadmap links to [[Plan]] and more.'
};
const outgoing: WikiLink[] = [
	{ target: 'Budget', display_text: 'Budget', path: '/finance/budget', is_valid: true },
	{ target: 'Budget', display_text: 'Budget again', path: '/finance/budget', is_valid: true },
	{ target: 'Missing', display_text: 'Missing', path: '/missing', is_valid: false }
];

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => (resolve = r));
	return { promise, resolve };
}

// Delete lives in the "More actions" menu. bits-ui turns pointer events off on
// <body> while a menu or dialog closes, so wait for that before clicking.
async function clickDelete() {
	await waitForPointerEvents();
	await userEvent.click(screen.getByTestId('document-actions-menu'));
	await userEvent.click(await screen.findByTestId('delete-document-button'));
}

describe('DocumentView', () => {
	beforeEach(() => {
		pageState.url = new URL('http://localhost/documents/notes/plan');
		vi.mocked(apiClient.getDocumentVersions).mockResolvedValue({
			versions: [],
			total: 3
		} as never);
		vi.mocked(apiClient.getDocumentBacklinks).mockResolvedValue([]);
		vi.mocked(apiClient.getDocumentOutgoingLinks).mockResolvedValue([]);
		vi.mocked(apiClient.getDocuments).mockResolvedValue([]);
	});

	afterEach(() => {
		cleanup();
		resetAllState();
		secretStore.reset();
		for (const key of Object.keys(stubProps)) delete stubProps[key];
		inlineEditorStub.reset();
		vi.clearAllMocks();
		vi.restoreAllMocks();
	});

	it('renders the title, dates, tags and markdown content', async () => {
		render(DocumentView, { props: { document: makeDoc() } });

		expect(screen.getByTestId('document-title')).toHaveTextContent('Plan');
		expect(screen.getByText('Created January 2, 2024')).toBeInTheDocument();
		expect(screen.getByText('Updated March 4, 2024')).toBeInTheDocument();
		expect(screen.getAllByTestId('document-tag').map((t) => t.textContent?.trim())).toEqual([
			'work',
			'q3'
		]);
		const content = screen.getByTestId('document-content');
		expect(await within(content).findByText('Hello world')).toBeInTheDocument();
		// The leading `# Plan` repeats the title: the header shows it, the body doesn't.
		expect(within(content).queryByRole('heading', { level: 1, name: 'Plan' })).toBeNull();
		expect(screen.getByTestId('breadcrumbs')).toHaveTextContent('notes');
	});

	it('hides the updated date when it equals the created date', () => {
		render(DocumentView, {
			props: { document: makeDoc({ updated: '2024-01-02T10:00:00Z', tags: [] }) }
		});

		expect(screen.queryByText(/^Updated/)).not.toBeInTheDocument();
		expect(screen.queryByTestId('document-tags')).not.toBeInTheDocument();
	});

	it('falls back to Untitled and the slug path', () => {
		render(DocumentView, {
			props: { document: makeDoc({ title: '', path: '', slug: 'loose' }) }
		});

		expect(screen.getByTestId('document-title')).toHaveTextContent('Untitled');
		expect(apiClient.getDocumentVersions).toHaveBeenCalledWith('/loose');
	});

	it('loads the version count and opens the version history', async () => {
		const versions = [{ hash: 'abc', message: 'init' }] as unknown as DocumentVersion[];
		render(DocumentView, { props: { document: makeDoc() } });

		const button = await screen.findByRole('button', { name: 'View document version history' });
		expect(button).toHaveTextContent('Versions: 3');
		expect(apiClient.getDocumentVersions).toHaveBeenCalledWith('/notes/plan');

		vi.mocked(apiClient.getDocumentVersions).mockResolvedValue({ versions, total: 1 } as never);
		await fireEvent.click(button);

		expect(stubProps.VersionHistoryModal.open).toBe(true);
		await vi.waitFor(() => expect(stubProps.VersionHistoryModal.versions).toEqual(versions));

		stubProps.VersionHistoryModal.onClose();
		flushSync();
		expect(stubProps.VersionHistoryModal.open).toBe(false);
	});

	it('offers version history and download in the more-actions menu', async () => {
		render(DocumentView, { props: { document: makeDoc() } });

		await userEvent.click(screen.getByTestId('document-actions-menu'));
		await userEvent.click(await screen.findByRole('menuitem', { name: 'Version history' }));
		expect(stubProps.VersionHistoryModal.open).toBe(true);
		stubProps.VersionHistoryModal.onClose();
		flushSync();

		await waitForPointerEvents();
		await userEvent.click(screen.getByTestId('document-actions-menu'));
		await userEvent.click(await screen.findByRole('menuitem', { name: 'Download' }));
		expect(apiClient.exportDocument).toHaveBeenCalledWith('/notes/plan');
	});

	it('shows an empty version list when loading the history fails', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		render(DocumentView, { props: { document: makeDoc() } });
		const button = await screen.findByRole('button', { name: 'View document version history' });

		vi.mocked(apiClient.getDocumentVersions).mockRejectedValue(new Error('boom'));
		await fireEvent.click(button);

		await vi.waitFor(() => expect(console.error).toHaveBeenCalled());
		expect(stubProps.VersionHistoryModal.versions).toEqual([]);
	});

	it('shows Loading versions while the count is slow, and 0 on failure', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const pending = deferred<never>();
		vi.mocked(apiClient.getDocumentVersions).mockReturnValue(pending.promise);
		render(DocumentView, { props: { document: makeDoc() } });

		expect(
			await screen.findByText('Loading versions...', {}, { timeout: 2000 })
		).toBeInTheDocument();

		vi.mocked(apiClient.getDocumentVersions).mockRejectedValue(new Error('no repo'));
		pending.resolve(Promise.reject(new Error('no repo')) as never);

		expect(await screen.findByText('Versions: 0', {}, { timeout: 2000 })).toBeInTheDocument();
	});

	it('restores a version through the API and surfaces a failure', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.mocked(apiClient.restoreDocumentToVersion).mockRejectedValue(new Error('conflict'));
		render(DocumentView, { props: { document: makeDoc() } });

		await expect(
			stubProps.VersionHistoryModal.onRestore({ hash: 'abc' } as DocumentVersion)
		).rejects.toThrow('conflict');
		expect(apiClient.restoreDocumentToVersion).toHaveBeenCalledWith('/notes/plan', 'abc');
	});

	describe('read/edit mode', () => {
		const ctrlE = () => fireEvent.keyDown(window, { key: 'e', ctrlKey: true });

		it('starts in reading mode with Read pressed and no editor loaded', () => {
			render(DocumentView, { props: { document: makeDoc() } });

			expect(screen.getByTestId('read-mode-button')).toHaveAttribute('aria-checked', 'true');
			expect(screen.getByTestId('edit-document-button')).toHaveAttribute('aria-checked', 'false');
			expect(screen.getByTestId('document-content')).toBeInTheDocument();
			expect(screen.queryByTestId('inline-editor-stub')).not.toBeInTheDocument();
		});

		it('edits in place: the editor replaces the rendered content and header title', async () => {
			const onModeChange = vi.fn();
			render(DocumentView, { props: { document: makeDoc(), onModeChange } });

			await fireEvent.click(screen.getByTestId('edit-document-button'));

			expect(await screen.findByTestId('inline-editor-stub')).toBeInTheDocument();
			expect(onModeChange).toHaveBeenCalledWith('edit');
			expect(screen.getByTestId('edit-document-button')).toHaveAttribute('aria-checked', 'true');
			expect(screen.queryByTestId('document-content')).not.toBeInTheDocument();
			expect(screen.queryByTestId('document-title')).not.toBeInTheDocument();
			expect(screen.getByTestId('document-view')).toHaveAttribute('data-mode', 'edit');
			// Opened by the user, so the editor takes focus once it has loaded.
			expect(inlineEditorStub.props?.autofocus).toBe(true);
		});

		it('toggles with Ctrl+E and saves before going back to reading', async () => {
			const onModeChange = vi.fn();
			render(DocumentView, { props: { document: makeDoc(), onModeChange } });

			await ctrlE();
			await screen.findByTestId('inline-editor-stub');
			await ctrlE();

			await vi.waitFor(() => expect(onModeChange).toHaveBeenLastCalledWith('read'));
			expect(inlineEditorStub.saves).toEqual(['manual']);
			expect(screen.getByTestId('document-content')).toBeInTheDocument();
		});

		it('stays in edit mode when the save fails', async () => {
			inlineEditorStub.saveResult = false;
			const onModeChange = vi.fn();
			render(DocumentView, { props: { document: makeDoc(), mode: 'edit', onModeChange } });
			await screen.findByTestId('inline-editor-stub');

			await fireEvent.click(screen.getByTestId('read-mode-button'));

			await vi.waitFor(() => expect(inlineEditorStub.saves).toEqual(['manual']));
			expect(onModeChange).not.toHaveBeenCalled();
			expect(screen.getByTestId('document-view')).toHaveAttribute('data-mode', 'edit');
		});

		it('keeps one editor mounted (hidden) across toggles', async () => {
			render(DocumentView, { props: { document: makeDoc() } });

			await ctrlE();
			const editor = await screen.findByTestId('inline-editor-stub');
			await ctrlE();
			await vi.waitFor(() => expect(screen.getByTestId('document-content')).toBeInTheDocument());
			expect(editor.parentElement).toHaveClass('hidden');
			await ctrlE();

			await vi.waitFor(() => expect(editor.parentElement).not.toHaveClass('hidden'));
			expect(inlineEditorStub.mounts).toBe(1);
			// Shown again: the kept editor gets the focus back.
			await vi.waitFor(() => expect(inlineEditorStub.focusCalls).toBe(1));
		});

		it('opening straight into edit mode does not steal focus', async () => {
			render(DocumentView, { props: { document: makeDoc(), mode: 'edit' } });

			await screen.findByTestId('inline-editor-stub');
			expect(inlineEditorStub.props?.autofocus).toBe(false);
		});

		it('ignores Ctrl+E while a dialog is open', async () => {
			const onModeChange = vi.fn();
			render(DocumentView, { props: { document: makeDoc(), onModeChange } });
			await fireEvent.click(screen.getByTestId('share-document-button'));

			await ctrlE();

			expect(onModeChange).not.toHaveBeenCalled();
		});

		it('passes saved documents up', async () => {
			const onSaved = vi.fn();
			render(DocumentView, { props: { document: makeDoc(), mode: 'edit', onSaved } });
			await screen.findByTestId('inline-editor-stub');

			const saved = makeDoc({ title: 'Renamed', path: '/notes/renamed' });
			(inlineEditorStub.props?.onSaved as (d: Document) => void)(saved);

			expect(onSaved).toHaveBeenCalledWith(saved);
		});

		it('forgets the draft before deleting, so the unsaved-changes guard stays quiet', async () => {
			const onDelete = vi.fn();
			render(DocumentView, { props: { document: makeDoc(), mode: 'edit', onDelete } });
			await screen.findByTestId('inline-editor-stub');

			await clickDelete();
			await fireEvent.click(await screen.findByTestId('confirm-delete-button'));

			expect(inlineEditorStub.discards).toBe(1);
			expect(onDelete).toHaveBeenCalledWith('/notes/plan');
		});
	});

	it('offers Add Content for an empty document, which opens the editor', async () => {
		render(DocumentView, { props: { document: makeDoc({}, '') } });

		expect(screen.getByText('This document has no content yet.')).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Add Content' }));

		expect(await screen.findByTestId('inline-editor-stub')).toBeInTheDocument();
	});

	it('opens the share modal for this document', async () => {
		render(DocumentView, { props: { document: makeDoc() } });
		expect(stubProps.ShareDocumentModal.open).toBe(false);

		await fireEvent.click(screen.getByTestId('share-document-button'));

		expect(stubProps.ShareDocumentModal.open).toBe(true);
		expect(stubProps.ShareDocumentModal.documentPath).toBe('/notes/plan');
		expect(stubProps.ShareDocumentModal.documentTitle).toBe('Plan');

		stubProps.ShareDocumentModal.onclose();
		flushSync();
		expect(stubProps.ShareDocumentModal.open).toBe(false);
	});

	it('deletes after confirmation, awaiting an async onDelete', async () => {
		const done = deferred<void>();
		const onDelete = vi.fn(() => done.promise);
		render(DocumentView, { props: { document: makeDoc(), onDelete } });

		await clickDelete();
		await fireEvent.click(await screen.findByTestId('confirm-delete-button'));

		expect(onDelete).toHaveBeenCalledWith('/notes/plan');
		// The dialog waits for the async delete before closing.
		expect(screen.getByTestId('confirm-delete-button')).toBeInTheDocument();
		done.resolve();
		await vi.waitFor(() =>
			expect(screen.queryByTestId('confirm-delete-button')).not.toBeInTheDocument()
		);
	});

	it('deletes with a synchronous onDelete', async () => {
		const onDelete = vi.fn();
		render(DocumentView, { props: { document: makeDoc(), onDelete } });

		await clickDelete();
		await fireEvent.click(await screen.findByTestId('confirm-delete-button'));

		expect(onDelete).toHaveBeenCalledTimes(1);
		await vi.waitFor(() =>
			expect(screen.queryByTestId('confirm-delete-button')).not.toBeInTheDocument()
		);
	});

	it('keeps the dialog open when deleting fails', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const onDelete = vi.fn().mockRejectedValue(new Error('locked'));
		render(DocumentView, { props: { document: makeDoc(), onDelete } });

		await clickDelete();
		await fireEvent.click(await screen.findByTestId('confirm-delete-button'));

		await vi.waitFor(() => expect(console.error).toHaveBeenCalled());
		expect(screen.getByTestId('confirm-delete-button')).toBeInTheDocument();
	});

	it('cancels a delete', async () => {
		const onDelete = vi.fn();
		render(DocumentView, { props: { document: makeDoc(), onDelete } });

		await clickDelete();
		await fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

		await vi.waitFor(() =>
			expect(screen.queryByTestId('confirm-delete-button')).not.toBeInTheDocument()
		);
		expect(onDelete).not.toHaveBeenCalled();
	});

	describe('links', () => {
		beforeEach(() => {
			vi.mocked(apiClient.getDocumentBacklinks).mockResolvedValue([backlink]);
			vi.mocked(apiClient.getDocumentOutgoingLinks).mockResolvedValue(outgoing);
		});

		it('loads backlinks and outgoing links and shows the graph by default', async () => {
			render(DocumentView, { props: { document: makeDoc() } });

			expect(await screen.findByRole('heading', { name: 'Links' })).toBeInTheDocument();
			expect(apiClient.getDocumentBacklinks).toHaveBeenCalledWith('/notes/plan');
			expect(apiClient.getDocumentOutgoingLinks).toHaveBeenCalledWith('/notes/plan');
			// 1 backlink + 1 distinct valid outgoing link
			await vi.waitFor(() => expect(stubProps.GraphView).toBeDefined());
			expect(screen.getByRole('heading', { name: 'Links' }).nextElementSibling).toHaveTextContent(
				'2'
			);
			expect(stubProps.GraphView.backlinks).toEqual([backlink]);
			expect(stubProps.GraphView.outgoingLinks).toEqual(outgoing);
		});

		it('lists links in list view and navigates to them', async () => {
			render(DocumentView, { props: { document: makeDoc() } });
			await screen.findByRole('heading', { name: 'Links' });

			await fireEvent.click(screen.getByRole('button', { name: /list/i }));

			expect(screen.getByText('Backlinks (1)')).toBeInTheDocument();
			expect(screen.getByText('Outgoing Links (1)')).toBeInTheDocument();
			expect(screen.getByText(/The roadmap links to/)).toBeInTheDocument();
			expect(screen.queryByText('Missing')).not.toBeInTheDocument();

			await fireEvent.click(screen.getByRole('button', { name: 'Navigate to document: Roadmap' }));
			expect(goto).toHaveBeenCalledWith('/documents/notes/roadmap');

			await fireEvent.click(screen.getByRole('button', { name: 'Navigate to document: Budget' }));
			expect(goto).toHaveBeenCalledWith('/documents/finance/budget');
		});

		it('shows a loading state while links load', async () => {
			const pending = deferred<Document[]>();
			vi.mocked(apiClient.getDocumentBacklinks)
				.mockResolvedValueOnce([backlink])
				.mockReturnValueOnce(pending.promise);
			const { rerender } = render(DocumentView, { props: { document: makeDoc() } });
			await screen.findByRole('heading', { name: 'Links' });

			await rerender({ document: makeDoc({ path: '/notes/other' }) });

			expect(await screen.findByText('Loading links...')).toBeInTheDocument();
			pending.resolve([backlink]);
			await vi.waitFor(() =>
				expect(screen.queryByText('Loading links...')).not.toBeInTheDocument()
			);
		});

		it('hides the links section when there are none', async () => {
			vi.mocked(apiClient.getDocumentBacklinks).mockResolvedValue([]);
			vi.mocked(apiClient.getDocumentOutgoingLinks).mockResolvedValue([outgoing[2]]);
			render(DocumentView, { props: { document: makeDoc() } });

			await vi.waitFor(() => expect(apiClient.getDocumentOutgoingLinks).toHaveBeenCalled());
			await screen.findByRole('button', { name: 'View document version history' });
			expect(screen.queryByRole('heading', { name: 'Links' })).not.toBeInTheDocument();
		});
	});

	describe('secrets', () => {
		it('marks secret placeholders as locked', async () => {
			render(DocumentView, {
				props: { document: makeDoc({}, 'Token: {{secret:api-key}} #ops') }
			});

			const content = screen.getByTestId('document-content');
			await vi.waitFor(() => expect(content.querySelector('.secret-placeholder')).not.toBeNull());
			expect(content).toHaveTextContent('{{secret:api-key}}');
			expect(content.querySelector('[title="Tag: ops"]')).not.toBeNull();
		});

		it('replaces secret placeholders once secrets are unlocked', async () => {
			vi.mocked(apiClient.getSecretsStatus).mockResolvedValue({ unlocked: true } as never);
			vi.mocked(apiClient.getSecret).mockResolvedValue({ value: 's3cr3t' } as never);
			await secretStore.loadStatus();

			render(DocumentView, { props: { document: makeDoc({}, 'Token: {{secret:api-key}}') } });

			const content = screen.getByTestId('document-content');
			expect(await within(content).findByText('Token: s3cr3t')).toBeInTheDocument();
			expect(apiClient.getSecret).toHaveBeenCalledWith('api-key');
		});
	});
});
