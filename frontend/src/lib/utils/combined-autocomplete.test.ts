import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { currentCompletions, startCompletion, completionStatus } from '@codemirror/autocomplete';

vi.mock('$lib/utils/markdown-cache', () => ({
	getCachedDocuments: vi.fn(),
	getCachedTags: vi.fn()
}));

import { getCachedDocuments, getCachedTags } from '$lib/utils/markdown-cache';
import { combinedAutocompletionExtension } from './combined-autocomplete';

let view: EditorView | undefined;

function mount(doc: string, cursor: number) {
	view?.dom.parentElement?.remove();
	view?.destroy();
	const parent = document.createElement('div');
	document.body.appendChild(parent);
	view = new EditorView({
		state: EditorState.create({
			doc,
			selection: { anchor: cursor },
			extensions: [combinedAutocompletionExtension()]
		}),
		parent
	});
	view.focus();
	startCompletion(view);
}

const labels = () => currentCompletions(view!.state).map((c) => c.label);

/** Waits until the completion sources have answered (with or without options). */
async function settled() {
	await new Promise((r) => setTimeout(r, 150));
	await vi.waitFor(() => expect(completionStatus(view!.state)).not.toBe('pending'));
}

describe('combinedAutocompletionExtension', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(getCachedDocuments).mockResolvedValue([
			{ metaData: { title: 'Writing style', path: '/writing' }, content: 'x'.repeat(150) },
			{ metaData: { title: 'Deployment', path: '/deploy' }, content: 'short' },
			{ metaData: { title: 'Rewriting history', path: '/history' }, content: '' }
		] as never);
		vi.mocked(getCachedTags).mockResolvedValue([
			{ name: 'golang', count: 4 },
			{ name: 'go-kit' },
			{ name: 'rust', count: 1 }
		] as never);
	});

	afterEach(() => {
		view?.dom.parentElement?.remove();
		view?.destroy();
		view = undefined;
		vi.restoreAllMocks();
	});

	it('suggests documents by title inside [[ ]]', async () => {
		const doc = 'see [[writ]]';
		mount(doc, doc.indexOf(']]'));

		await vi.waitFor(() => expect(labels().sort()).toEqual(['Rewriting history', 'Writing style']));
		const first = currentCompletions(view!.state).find((c) => c.label === 'Writing style')!;
		expect(first.detail).toBe('/writing');
		expect(first.info).toBe('x'.repeat(100) + '...');
	});

	it('suggests tags after #, with usage counts', async () => {
		const doc = 'tagged #go';
		mount(doc, doc.length);

		await vi.waitFor(() => expect(labels().sort()).toEqual(['go-kit', 'golang']));
		const details = Object.fromEntries(
			currentCompletions(view!.state).map((c) => [c.label, c.detail])
		);
		expect(details).toEqual({ golang: 'Used 4 times', 'go-kit': 'Used 0 times' });
	});

	it('offers nothing outside a link or tag', async () => {
		mount('plain [[closed]] text', 'plain [[closed]] te'.length);
		await settled();
		expect(labels()).toEqual([]);

		mount('unclosed [[wri', 'unclosed [[wri'.length);
		await settled();
		expect(labels()).toEqual([]);
	});

	it('offers nothing when the lookups fail', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.mocked(getCachedDocuments).mockRejectedValue(new Error('down'));
		vi.mocked(getCachedTags).mockRejectedValue(new Error('down'));

		mount('#go', 3);
		await settled();
		expect(labels()).toEqual([]);

		mount('[[a]]', 3);
		await settled();
		expect(labels()).toEqual([]);
	});
});
