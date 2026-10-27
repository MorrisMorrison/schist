import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Document } from '#lib/api/types.ts';

vi.mock('#lib/stores/documents.svelte.ts', () => ({
	documentActions: {
		updateDocumentByPath: vi.fn(),
		checkDocumentExists: vi.fn()
	}
}));

import { documentActions } from '#lib/stores/documents.svelte.ts';
import { replaceLastPathSegment, useDocumentDraft } from './useDocumentDraft.svelte';

function makeDoc(content = '# Plan\n\nHello', path = '/notes/plan'): Document {
	return {
		metaData: {
			title: 'Plan',
			path,
			slug: 'plan',
			created: '2024-01-01T00:00:00Z',
			updated: '2024-01-02T00:00:00Z',
			tags: []
		},
		content
	};
}

const update = vi.mocked(documentActions.updateDocumentByPath);
const exists = vi.mocked(documentActions.checkDocumentExists);

describe('replaceLastPathSegment', () => {
	it.each([
		['notes/plan', 'roadmap', 'notes/roadmap'],
		['plan', 'roadmap', 'roadmap'],
		['', 'roadmap', 'roadmap'],
		['a/b/c/', 'd', 'a/b/d']
	])('%s + %s -> %s', (path, segment, expected) => {
		expect(replaceLastPathSegment(path, segment)).toBe(expected);
	});
});

describe('useDocumentDraft', () => {
	beforeEach(() => {
		update.mockImplementation(async (_path, request) => ({
			metaData: { ...request.metaData, updated: '2024-02-01T00:00:00Z' },
			content: request.content
		}));
		exists.mockResolvedValue(false);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.clearAllMocks();
	});

	it('starts clean on the document, with a route-style path', () => {
		const draft = useDocumentDraft({ document: makeDoc() });

		expect(draft.content).toBe('# Plan\n\nHello');
		expect(draft.isDirty).toBe(false);
		expect(draft.path).toBe('notes/plan');
		expect(draft.title).toBe('Plan');
	});

	it('saving a clean draft does nothing', async () => {
		const draft = useDocumentDraft({ document: makeDoc() });

		expect(await draft.save()).toBe(true);
		expect(update).not.toHaveBeenCalled();
	});

	it('saves the text with title and tags taken from it', async () => {
		const onSaved = vi.fn();
		const draft = useDocumentDraft({ document: makeDoc(), onSaved });
		draft.setContent('# Plan\n\nHello #work  \n');

		expect(await draft.save('manual')).toBe(true);

		expect(update).toHaveBeenCalledWith(
			'notes/plan',
			expect.objectContaining({
				content: '# Plan\n\nHello #work',
				metaData: expect.objectContaining({ title: 'Plan', path: 'notes/plan', tags: ['work'] })
			}),
			'manual'
		);
		expect(draft.isDirty).toBe(false);
		expect(draft.lastSaved).toBeInstanceOf(Date);
		expect(onSaved).toHaveBeenCalledWith(
			expect.objectContaining({ content: '# Plan\n\nHello #work' })
		);
	});

	it('renames through the first heading, and later saves use the new path', async () => {
		const draft = useDocumentDraft({ document: makeDoc() });
		draft.setContent('# Roadmap\n\nHello');
		expect(draft.targetPath).toBe('notes/roadmap');

		await draft.save();
		expect(exists).toHaveBeenCalledWith('notes/roadmap');
		expect(update).toHaveBeenLastCalledWith(
			'notes/plan',
			expect.objectContaining({ metaData: expect.objectContaining({ path: 'notes/roadmap' }) }),
			'manual'
		);
		expect(draft.path).toBe('notes/roadmap');

		draft.setContent('# Roadmap\n\nMore');
		await draft.save('auto');
		expect(update).toHaveBeenLastCalledWith('notes/roadmap', expect.anything(), 'auto');
	});

	it('refuses a rename onto an existing document', async () => {
		exists.mockResolvedValue(true);
		const draft = useDocumentDraft({ document: makeDoc() });
		draft.setContent('# Taken\n\nHello');

		expect(await draft.save()).toBe(false);

		expect(update).not.toHaveBeenCalled();
		expect(draft.error).toMatch(/already exists at "notes\/taken"/);
		expect(draft.isDirty).toBe(true);
	});

	it('refuses to save empty content', async () => {
		const draft = useDocumentDraft({ document: makeDoc() });
		draft.setContent('   ');

		expect(await draft.save()).toBe(false);
		expect(draft.error).toBe('Content is required');
	});

	it('keeps the draft dirty and reports the error when the save fails', async () => {
		update.mockRejectedValue(new Error('disk full'));
		const draft = useDocumentDraft({ document: makeDoc() });
		draft.setContent('# Plan\n\nChanged');

		expect(await draft.save()).toBe(false);
		expect(draft.isDirty).toBe(true);
		expect(draft.error).toBe('disk full');
		expect(draft.isSaving).toBe(false);
	});

	it('auto-saves after a quiet period and restarts the timer on each change', async () => {
		vi.useFakeTimers();
		const draft = useDocumentDraft({ document: makeDoc(), autoSaveDelayMs: 1000 });

		draft.setContent('# Plan\n\nA');
		await vi.advanceTimersByTimeAsync(800);
		draft.setContent('# Plan\n\nAB');
		await vi.advanceTimersByTimeAsync(800);
		expect(update).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(300);
		expect(update).toHaveBeenCalledTimes(1);
		expect(update).toHaveBeenCalledWith('notes/plan', expect.anything(), 'auto');
	});

	it('does not auto-save once the text is back to the saved version', async () => {
		vi.useFakeTimers();
		const draft = useDocumentDraft({ document: makeDoc(), autoSaveDelayMs: 1000 });

		draft.setContent('# Plan\n\nX');
		draft.setContent('# Plan\n\nHello');
		await vi.advanceTimersByTimeAsync(2000);

		expect(update).not.toHaveBeenCalled();
	});

	it('runs saves one at a time', async () => {
		let release!: () => void;
		update.mockImplementationOnce(
			async (_path, request) =>
				new Promise((resolve) => {
					release = () => resolve({ metaData: request.metaData, content: request.content });
				})
		);
		const draft = useDocumentDraft({ document: makeDoc() });
		draft.setContent('# Plan\n\nOne');
		const first = draft.save();
		draft.setContent('# Plan\n\nTwo');
		const second = draft.save();

		await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(1));
		release();
		await Promise.all([first, second]);

		expect(update).toHaveBeenCalledTimes(2);
		expect(update.mock.calls[1][1].content).toBe('# Plan\n\nTwo');
	});

	it('discard and dispose stop a pending auto-save', async () => {
		vi.useFakeTimers();
		const draft = useDocumentDraft({ document: makeDoc(), autoSaveDelayMs: 1000 });

		draft.setContent('# Plan\n\nX');
		draft.discard();
		expect(draft.isDirty).toBe(false);
		draft.setContent('# Plan\n\nY');
		draft.dispose();
		await vi.advanceTimersByTimeAsync(2000);

		expect(update).not.toHaveBeenCalled();
	});
});
