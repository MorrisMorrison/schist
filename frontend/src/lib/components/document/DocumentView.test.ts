import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
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
		getSecret: vi.fn()
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

import { goto } from '$app/navigation';
import { apiClient } from '$lib/api/client';
import { resetAllState } from '$lib/stores/documents.svelte';
import { secretStore } from '$lib/stores/secrets.svelte';
import { stubProps } from '$lib/test/stub-registry';
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

	it('calls onEdit with the slug from the Edit button', async () => {
		const onEdit = vi.fn();
		render(DocumentView, { props: { document: makeDoc(), onEdit } });

		await fireEvent.click(screen.getByTestId('edit-document-button'));

		expect(onEdit).toHaveBeenCalledWith('plan');
	});

	it('offers Add Content for an empty document', async () => {
		const onEdit = vi.fn();
		render(DocumentView, { props: { document: makeDoc({}, ''), onEdit } });

		expect(screen.getByText('This document has no content yet.')).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Add Content' }));

		expect(onEdit).toHaveBeenCalledWith('plan');
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

		await fireEvent.click(screen.getByTestId('delete-document-button'));
		await fireEvent.click(await screen.findByTestId('confirm-delete-button'));

		expect(onDelete).toHaveBeenCalledWith('/notes/plan');
		expect(screen.getByTestId('delete-document-button')).toBeDisabled();
		done.resolve();
		await vi.waitFor(() =>
			expect(screen.queryByTestId('confirm-delete-button')).not.toBeInTheDocument()
		);
		expect(screen.getByTestId('delete-document-button')).not.toBeDisabled();
	});

	it('deletes with a synchronous onDelete', async () => {
		const onDelete = vi.fn();
		render(DocumentView, { props: { document: makeDoc(), onDelete } });

		await fireEvent.click(screen.getByTestId('delete-document-button'));
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

		await fireEvent.click(screen.getByTestId('delete-document-button'));
		await fireEvent.click(await screen.findByTestId('confirm-delete-button'));

		await vi.waitFor(() => expect(console.error).toHaveBeenCalled());
		expect(screen.getByTestId('confirm-delete-button')).toBeInTheDocument();
	});

	it('cancels a delete', async () => {
		const onDelete = vi.fn();
		render(DocumentView, { props: { document: makeDoc(), onDelete } });

		await fireEvent.click(screen.getByTestId('delete-document-button'));
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
