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

	it('sends the custom front matter back unchanged', async () => {
		const doc = makeDoc();
		doc.metaData.properties = { status: 'active', aliases: ['gw'] };
		const draft = useDocumentDraft({ document: doc });
		draft.setContent('# Plan\n\nEdited');

		await draft.save();
		expect(update).toHaveBeenLastCalledWith(
			'notes/plan',
			expect.objectContaining({
				metaData: expect.objectContaining({ properties: { status: 'active', aliases: ['gw'] } })
			}),
			'manual'
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

	it('keeps a path that differs from the heading while the heading is unchanged', async () => {
		// An imported note lives at its file name, not at its heading's slug.
		const draft = useDocumentDraft({
			document: makeDoc('# router — main gateway\n\nPorts', '/devices/router')
		});
		draft.setContent('# router — main gateway\n\nPorts and VLANs');
		expect(draft.targetPath).toBe('devices/router');

		await draft.save();
		expect(exists).not.toHaveBeenCalled();
		expect(update).toHaveBeenLastCalledWith(
			'devices/router',
			expect.objectContaining({
				metaData: expect.objectContaining({ path: 'devices/router', slug: 'router' })
			}),
			'manual'
		);
		expect(draft.path).toBe('devices/router');

		draft.setContent('# Gateway\n\nPorts and VLANs');
		expect(draft.targetPath).toBe('devices/gateway');
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

	it('sends the version it started from as baseVersion, then the saved one', async () => {
		update.mockImplementationOnce(async (_p, request) => ({
			metaData: { ...request.metaData, updated: '2024-02-01T00:00:00Z' },
			content: request.content,
			version: 'v2'
		}));
		const draft = useDocumentDraft({ document: { ...makeDoc(), version: 'v1' } });

		draft.setContent('# Plan\n\nOne');
		await draft.save('manual');
		expect(update.mock.calls[0][1].baseVersion).toBe('v1');

		draft.setContent('# Plan\n\nTwo');
		await draft.save('manual');
		expect(update.mock.calls[1][1].baseVersion).toBe('v2');
	});

	it('on DOCUMENT_CHANGED keeps the text, stops autosave and offers both ways out', async () => {
		vi.useFakeTimers();
		const current = { ...makeDoc('# Plan\n\nFrom GitHub'), version: 'v9' };
		update.mockRejectedValueOnce(
			new Error(
				JSON.stringify({
					error: 'changed',
					code: 'DOCUMENT_CHANGED',
					details: { document: current }
				})
			)
		);
		const draft = useDocumentDraft({
			document: { ...makeDoc(), version: 'v1' },
			autoSaveDelayMs: 100
		});

		draft.setContent('# Plan\n\nMine');
		await vi.advanceTimersByTimeAsync(100);
		expect(draft.conflict?.content).toBe('# Plan\n\nFrom GitHub');
		expect(draft.content).toBe('# Plan\n\nMine');

		draft.setContent('# Plan\n\nMine, more');
		await vi.advanceTimersByTimeAsync(1000);
		expect(update).toHaveBeenCalledTimes(1); // no autosave while the conflict is open

		await draft.keepMine();
		expect(update).toHaveBeenCalledTimes(2);
		expect(update.mock.calls[1][1].baseVersion).toBe('v9');
		expect(draft.conflict).toBeNull();
	});

	it.each([
		['deleted', { document: null, deleted: true }],
		['unreadable', { document: null, unreadable: true }]
	] as const)(
		'on a %s page opens the conflict, and keepMine saves again without a baseVersion',
		async (reason, details) => {
			vi.useFakeTimers();
			update.mockRejectedValueOnce(
				new Error(JSON.stringify({ error: 'gone', code: 'DOCUMENT_CHANGED', details }))
			);
			const draft = useDocumentDraft({
				document: { ...makeDoc(), version: 'v1' },
				autoSaveDelayMs: 100
			});

			draft.setContent('# Plan\n\nMine');
			await vi.advanceTimersByTimeAsync(100);
			expect(draft.staleReason).toBe(reason);
			expect(draft.conflict).toBeNull();
			expect(draft.error).toBe('');

			draft.setContent('# Plan\n\nMine, more');
			await vi.advanceTimersByTimeAsync(1000);
			expect(update).toHaveBeenCalledTimes(1);

			await draft.keepMine();
			expect(update).toHaveBeenCalledTimes(2);
			expect(update.mock.calls[1][1].baseVersion).toBeUndefined();
			expect(draft.staleReason).toBeNull();
		}
	);

	it('keepMine on a deleted page with a new title saves straight to the new path', async () => {
		exists.mockResolvedValue(false);
		update.mockRejectedValueOnce(
			new Error(
				JSON.stringify({
					error: 'gone',
					code: 'DOCUMENT_CHANGED',
					details: { document: null, deleted: true }
				})
			)
		);
		const draft = useDocumentDraft({ document: { ...makeDoc(), version: 'v1' } });
		draft.setContent('# Plan\n\nMine');
		await draft.save('manual');

		draft.setContent('# Other\n\nMine');
		await draft.keepMine();
		expect(update.mock.calls[1][0]).toBe('notes/other');
		expect(update.mock.calls[1][1].baseVersion).toBeUndefined();
	});

	it('keepMine on a deleted page with the same title keeps the path', async () => {
		update.mockRejectedValueOnce(
			new Error(
				JSON.stringify({
					error: 'gone',
					code: 'DOCUMENT_CHANGED',
					details: { document: null, deleted: true }
				})
			)
		);
		const draft = useDocumentDraft({ document: { ...makeDoc(), version: 'v1' } });
		draft.setContent('# Plan\n\nMine');
		await draft.save('manual');
		await draft.keepMine();
		expect(update.mock.calls[1][0]).toBe('notes/plan');
	});

	it('discardMine without a clipboard discards nothing and says so', async () => {
		Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
		update.mockRejectedValueOnce(
			new Error(
				JSON.stringify({
					error: 'gone',
					code: 'DOCUMENT_CHANGED',
					details: { document: null, deleted: true }
				})
			)
		);
		const draft = useDocumentDraft({ document: { ...makeDoc(), version: 'v1' } });
		draft.setContent('# Plan\n\nMine');
		await draft.save('manual');
		await draft.discardMine();

		expect(draft.isDirty).toBe(true);
		expect(draft.staleReason).toBe('deleted');
		expect(draft.error).toContain('nothing was discarded');
	});

	it('loadCurrent reports a missing clipboard', async () => {
		Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
		const current = { ...makeDoc('# Plan\n\nFrom GitHub'), version: 'v9' };
		update.mockRejectedValueOnce(
			new Error(
				JSON.stringify({
					error: 'changed',
					code: 'DOCUMENT_CHANGED',
					details: { document: current }
				})
			)
		);
		const draft = useDocumentDraft({ document: { ...makeDoc(), version: 'v1' } });
		draft.setContent('# Plan\n\nMine');
		await draft.save('manual');
		await draft.loadCurrent();
		expect(draft.content).toBe('# Plan\n\nFrom GitHub');
		expect(draft.error).toContain("Couldn't copy");
	});

	it('discardMine copies my text to the clipboard and leaves the editor clean', async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
		update.mockRejectedValueOnce(
			new Error(
				JSON.stringify({
					error: 'gone',
					code: 'DOCUMENT_CHANGED',
					details: { document: null, deleted: true }
				})
			)
		);
		const draft = useDocumentDraft({ document: { ...makeDoc(), version: 'v1' } });

		draft.setContent('# Plan\n\nMine');
		await draft.save('manual');
		await draft.discardMine();

		expect(writeText).toHaveBeenCalledWith('# Plan\n\nMine');
		expect(draft.isDirty).toBe(false);
		expect(draft.staleReason).toBeNull();
	});

	it('loadCurrent copies my text to the clipboard and loads the current page', async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, 'clipboard', {
			value: { writeText },
			configurable: true
		});
		const current = { ...makeDoc('# Plan\n\nFrom GitHub'), version: 'v9' };
		update.mockRejectedValueOnce(
			new Error(
				JSON.stringify({
					error: 'changed',
					code: 'DOCUMENT_CHANGED',
					details: { document: current }
				})
			)
		);
		const draft = useDocumentDraft({ document: { ...makeDoc(), version: 'v1' } });

		draft.setContent('# Plan\n\nMine');
		await draft.save('manual');
		await draft.loadCurrent();

		expect(writeText).toHaveBeenCalledWith('# Plan\n\nMine');
		expect(draft.content).toBe('# Plan\n\nFrom GitHub');
		expect(draft.isDirty).toBe(false);
		expect(draft.conflict).toBeNull();
	});

	it('loadCurrent tells the parent about the current page', async () => {
		Object.defineProperty(navigator, 'clipboard', {
			value: { writeText: vi.fn().mockResolvedValue(undefined) },
			configurable: true
		});
		const current = { ...makeDoc('# Plan\n\nFrom GitHub'), version: 'v9' };
		update.mockRejectedValueOnce(
			new Error(
				JSON.stringify({
					error: 'changed',
					code: 'DOCUMENT_CHANGED',
					details: { document: current }
				})
			)
		);
		const onSaved = vi.fn();
		const draft = useDocumentDraft({ document: { ...makeDoc(), version: 'v1' }, onSaved });

		draft.setContent('# Plan\n\nMine');
		await draft.save('manual');
		await draft.loadCurrent();

		expect(onSaved).toHaveBeenCalledWith(current);
	});

	it('loadCurrent still loads the page and says so when the clipboard fails', async () => {
		Object.defineProperty(navigator, 'clipboard', {
			value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
			configurable: true
		});
		const current = { ...makeDoc('# Plan\n\nFrom GitHub'), version: 'v9' };
		update.mockRejectedValueOnce(
			new Error(
				JSON.stringify({
					error: 'changed',
					code: 'DOCUMENT_CHANGED',
					details: { document: current }
				})
			)
		);
		const draft = useDocumentDraft({ document: { ...makeDoc(), version: 'v1' } });

		draft.setContent('# Plan\n\nMine');
		await draft.save('manual');
		await draft.loadCurrent();

		expect(draft.content).toBe('# Plan\n\nFrom GitHub');
		expect(draft.error).toContain("Couldn't copy your text");
	});
});
