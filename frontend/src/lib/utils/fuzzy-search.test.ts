import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Document } from '$lib/api/types';
import { addToRecentDocuments, fuzzySearchDocuments, getRecentDocumentPaths } from './fuzzy-search';

function doc(title: string, path: string, extra: Partial<Document> = {}): Document {
	return {
		metaData: { title, path, tags: [], ...(extra.metaData ?? {}) },
		content: extra.content ?? ''
	} as Document;
}

const titles = (docs: Document[]) => docs.map((d) => d.metaData.title);

describe('fuzzySearchDocuments', () => {
	it('returns nothing for a blank query', () => {
		expect(fuzzySearchDocuments([doc('A', '/a')], '   ')).toEqual([]);
	});

	it('ranks exact, then prefix, then later substring title matches', () => {
		const docs = [doc('ab Notes', '/x'), doc('notes', '/y'), doc('Notes ab', '/z')];

		expect(titles(fuzzySearchDocuments(docs, 'Notes'))).toEqual(['notes', 'Notes ab', 'ab Notes']);
	});

	it('matches characters in sequence (fuzzy) but drops non-matches', () => {
		const docs = [doc('Kubernetes', '/k'), doc('Groceries', '/g')];

		expect(titles(fuzzySearchDocuments(docs, 'kbs'))).toEqual(['Kubernetes']);
	});

	it('weights title over path, tags and content', () => {
		const docs = [
			doc('Other', '/x', { content: 'deploy steps' }),
			doc('Other 2', '/deploy'),
			doc('Other 3', '/y', { metaData: { tags: ['deploy'] } as Document['metaData'] }),
			doc('Deploy', '/z')
		];

		const ranked = titles(fuzzySearchDocuments(docs, 'deploy'));
		expect(ranked[0]).toBe('Deploy');
		expect(ranked.at(-1)).toBe('Other');
		expect(ranked).toHaveLength(4);
	});

	it('tolerates documents without metadata', () => {
		const bare = { content: 'hello world' } as unknown as Document;

		expect(fuzzySearchDocuments([bare], 'world')).toEqual([bare]);
	});
});

describe('recent documents', () => {
	beforeEach(() => localStorage.clear());
	afterEach(() => {
		localStorage.clear();
		vi.restoreAllMocks();
	});

	it('starts empty and ignores corrupt storage', () => {
		expect(getRecentDocumentPaths()).toEqual([]);
		localStorage.setItem('recent-documents', '{not json');
		expect(getRecentDocumentPaths()).toEqual([]);
	});

	it('moves a revisited path to the front without duplicates', () => {
		addToRecentDocuments('/a');
		addToRecentDocuments('/b');
		addToRecentDocuments('/a');

		expect(getRecentDocumentPaths()).toEqual(['/a', '/b']);
	});

	it('keeps only the 20 most recent', () => {
		for (let i = 0; i < 25; i++) addToRecentDocuments(`/d${i}`);

		const recent = getRecentDocumentPaths();
		expect(recent).toHaveLength(20);
		expect(recent[0]).toBe('/d24');
		expect(recent.at(-1)).toBe('/d5');
	});

	it('logs instead of throwing when storage is unavailable', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new Error('quota');
		});

		expect(() => addToRecentDocuments('/a')).not.toThrow();
		expect(error).toHaveBeenCalled();
	});
});
