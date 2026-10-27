import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import type { Document } from '#lib/api/types.ts';

// Reading the module's default export throws, so the lazy load fails.
vi.mock('#lib/components/document/DocumentGraphView.svelte', () => ({
	get default() {
		throw new Error('chunk failed to load');
	}
}));

import LazyDocumentGraphView from './LazyDocumentGraphView.svelte';

const current: Document = { metaData: { title: 'Plan', path: '/plan', slug: 'plan' }, content: '' };

describe('LazyDocumentGraphView when the graph chunk fails to load', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	it('shows an error instead of the graph', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});

		render(LazyDocumentGraphView, {
			props: { currentDocument: current, backlinks: [], outgoingLinks: [] }
		});

		expect(await screen.findByText('Failed to load graph visualization.')).toBeInTheDocument();
		expect(screen.queryByText('Loading graph...')).not.toBeInTheDocument();
	});
});
