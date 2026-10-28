import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { addToRecentDocuments, getRecentDocumentPaths } from './recent-documents';

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
