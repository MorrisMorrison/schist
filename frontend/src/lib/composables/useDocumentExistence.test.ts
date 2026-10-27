import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('#lib/stores/documents.svelte.ts', () => ({
	documentActions: {
		checkDocumentExists: vi.fn(),
		moveDocumentPath: vi.fn(),
		loadDocuments: vi.fn()
	},
	folderActions: {
		moveFolder: vi.fn(),
		loadFolderTree: vi.fn()
	}
}));

import { documentActions } from '#lib/stores/documents.svelte.ts';
import { useDocumentExistence } from './useDocumentExistence.svelte';

beforeEach(() => {
	vi.clearAllMocks();
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('useDocumentExistence', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	it('warns after the debounce when the path is taken', async () => {
		vi.mocked(documentActions.checkDocumentExists).mockResolvedValue(true);
		const existence = useDocumentExistence(300);

		existence.checkExistence('/notes/a');
		expect(existence.isChecking).toBe(true);
		await vi.advanceTimersByTimeAsync(299);
		expect(documentActions.checkDocumentExists).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);

		expect(documentActions.checkDocumentExists).toHaveBeenCalledWith('/notes/a');
		expect(existence.state).toEqual({
			exists: true,
			warning: 'A document already exists at "/notes/a". Please choose a different title.',
			isChecking: false
		});
	});

	it('only checks the last path typed', async () => {
		vi.mocked(documentActions.checkDocumentExists).mockResolvedValue(false);
		const existence = useDocumentExistence();

		existence.checkExistence('/a');
		existence.checkExistence('/ab');
		await vi.advanceTimersByTimeAsync(500);

		expect(documentActions.checkDocumentExists).toHaveBeenCalledTimes(1);
		expect(documentActions.checkDocumentExists).toHaveBeenCalledWith('/ab');
		expect(existence.exists).toBe(false);
		expect(existence.warning).toBe('');
	});

	it('skips blank paths and the document own path', async () => {
		const existence = useDocumentExistence();

		existence.checkExistence('   ');
		existence.checkExistence('/same', '/same');
		await vi.advanceTimersByTimeAsync(1000);

		expect(documentActions.checkDocumentExists).not.toHaveBeenCalled();
		expect(existence.isChecking).toBe(false);
	});

	it('treats a failed check as free', async () => {
		vi.spyOn(console, 'debug').mockImplementation(() => {});
		vi.mocked(documentActions.checkDocumentExists).mockRejectedValue(new Error('down'));
		const existence = useDocumentExistence();

		existence.checkExistence('/a');
		await vi.advanceTimersByTimeAsync(500);

		expect(existence.exists).toBe(false);
		expect(existence.isChecking).toBe(false);
	});

	it('reset and cleanup cancel a pending check', async () => {
		const existence = useDocumentExistence();

		existence.checkExistence('/a');
		existence.reset();
		expect(existence.isChecking).toBe(false);
		existence.checkExistence('/b');
		existence.cleanup();
		await vi.advanceTimersByTimeAsync(1000);

		expect(documentActions.checkDocumentExists).not.toHaveBeenCalled();
	});
});
