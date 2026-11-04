import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	addToRecentDocuments,
	getRecentDocumentPaths,
	getRecentDocuments
} from './recent-documents';

describe('recent documents with times', () => {
	beforeEach(() => localStorage.clear());
	afterEach(() => {
		localStorage.clear();
		vi.useRealTimers();
	});

	it('records when each page was opened, newest first', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-11-04T10:00:00Z'));
		addToRecentDocuments('/a');
		vi.setSystemTime(new Date('2026-11-04T10:05:00Z'));
		addToRecentDocuments('/b');

		expect(getRecentDocuments()).toEqual([
			{ path: '/b', openedAt: '2026-11-04T10:05:00.000Z' },
			{ path: '/a', openedAt: '2026-11-04T10:00:00.000Z' }
		]);
		expect(getRecentDocumentPaths()).toEqual(['/b', '/a']);
	});

	it('still reads the old format, a list of paths without times', () => {
		localStorage.setItem('recent-documents', JSON.stringify(['/old-1', '/old-2']));

		expect(getRecentDocuments()).toEqual([{ path: '/old-1' }, { path: '/old-2' }]);
		addToRecentDocuments('/new');
		expect(getRecentDocumentPaths()).toEqual(['/new', '/old-1', '/old-2']);
	});

	it('drops entries it does not understand', () => {
		localStorage.setItem(
			'recent-documents',
			JSON.stringify(['/ok', 42, { path: '/also-ok', openedAt: 'x' }, { nope: 1 }])
		);
		expect(getRecentDocuments().map((r) => r.path)).toEqual(['/ok', '/also-ok']);
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
