import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import type { Document } from '$lib/api/types';

const pageState = vi.hoisted(() => ({
	params: { path: 'notes/plan' } as Record<string, string>,
	url: new URL('http://localhost/documents/notes/plan')
}));
vi.mock('$app/state', () => ({ page: pageState }));

vi.mock('$lib/api/client', () => ({
	apiClient: {
		getDocumentByPath: vi.fn(),
		getDocumentVersions: vi.fn().mockResolvedValue({ versions: [], total: 0 }),
		getDocumentBacklinks: vi.fn().mockResolvedValue([]),
		getDocumentOutgoingLinks: vi.fn().mockResolvedValue([]),
		getDocuments: vi.fn().mockResolvedValue([]),
		getAssetUrl: vi.fn((path: string) => path),
		getSecretsStatus: vi.fn(),
		getSecret: vi.fn()
	}
}));
vi.mock('$lib/components/editor/DocumentInlineEditor.svelte', async () => ({
	default: (await import('$lib/test/InlineEditorStub.svelte')).default
}));
vi.mock('$lib/components/document/LazyDocumentGraphView.svelte', async () => ({
	default: (await import('$lib/test/stub-component')).namedStub('GraphView')
}));

import { replaceState } from '$app/navigation';
import { apiClient } from '$lib/api/client';
import { resetAllState } from '$lib/stores/documents.svelte';
import { settingsActions } from '$lib/stores/settings.svelte';
import { inlineEditorStub } from '$lib/test/inline-editor-stub';
import Page from './+page.svelte';

const doc: Document = {
	metaData: {
		title: 'Plan',
		path: '/notes/plan',
		slug: 'plan',
		created: '2024-01-01T00:00:00Z',
		updated: '2024-01-02T00:00:00Z',
		tags: []
	},
	content: '# Plan\n\nHello'
};

describe('document page modes', () => {
	beforeEach(() => {
		pageState.url = new URL('http://localhost/documents/notes/plan');
		vi.mocked(apiClient.getDocumentByPath).mockResolvedValue(doc);
	});

	afterEach(() => {
		cleanup();
		resetAllState();
		inlineEditorStub.reset();
		settingsActions.updateAppSetting('openDocumentsInEditMode', false);
		localStorage.removeItem('schist_settings');
		vi.clearAllMocks();
	});

	it('opens in reading mode', async () => {
		render(Page);

		expect(await screen.findByTestId('document-content')).toBeInTheDocument();
		expect(screen.getByTestId('document-view')).toHaveAttribute('data-mode', 'read');
	});

	it('opens in edit mode from ?mode=edit (the /edit/<path> redirect)', async () => {
		pageState.url = new URL('http://localhost/documents/notes/plan?mode=edit');
		render(Page);

		expect(await screen.findByTestId('inline-editor-stub')).toBeInTheDocument();
		expect(screen.getByTestId('document-view')).toHaveAttribute('data-mode', 'edit');
	});

	it('opens in edit mode when the setting asks for it', async () => {
		settingsActions.updateAppSetting('openDocumentsInEditMode', true);
		render(Page);

		expect(await screen.findByTestId('inline-editor-stub')).toBeInTheDocument();
	});

	it('mirrors the mode in the URL without navigating', async () => {
		render(Page);
		await fireEvent.click(await screen.findByTestId('edit-document-button'));

		await vi.waitFor(() =>
			expect(replaceState).toHaveBeenLastCalledWith('/documents/notes/plan?mode=edit', {})
		);

		await fireEvent.click(screen.getByTestId('read-mode-button'));
		await vi.waitFor(() =>
			expect(replaceState).toHaveBeenLastCalledWith('/documents/notes/plan', {})
		);
		expect(apiClient.getDocumentByPath).toHaveBeenCalledTimes(1);
	});

	it('follows a rename: shows the saved document and moves the URL to its new path', async () => {
		pageState.url = new URL('http://localhost/documents/notes/plan?mode=edit');
		render(Page);
		await screen.findByTestId('inline-editor-stub');

		const onSaved = inlineEditorStub.props?.onSaved as (d: Document) => void;
		onSaved({
			...doc,
			metaData: { ...doc.metaData, title: 'Roadmap', path: '/notes/roadmap' },
			content: '# Roadmap\n\nHello'
		});

		await vi.waitFor(() =>
			expect(replaceState).toHaveBeenLastCalledWith('/documents/notes/roadmap?mode=edit', {})
		);
		expect(apiClient.getDocumentByPath).toHaveBeenCalledTimes(1);
	});
});
