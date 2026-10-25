import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('$lib/api/client', () => ({
	apiClient: { getDocuments: vi.fn(), getAllTags: vi.fn() }
}));

import { apiClient } from '$lib/api/client';

import { getCachedDocuments, getCachedTags } from './markdown-cache';

// The cache lives in module state; moving the clock an hour on per test makes
// whatever an earlier test cached stale.
let clock = new Date('2026-01-01T00:00:00Z').getTime();

describe('markdown cache', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		clock += 60 * 60 * 1000;
		vi.setSystemTime(clock);
		vi.clearAllMocks();
		vi.spyOn(console, 'warn').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it('serves documents from cache for 60s, then refetches', async () => {
		vi.mocked(apiClient.getDocuments).mockResolvedValue([{ id: 1 }] as never);

		await expect(getCachedDocuments()).resolves.toEqual([{ id: 1 }]);
		vi.advanceTimersByTime(60000);
		await getCachedDocuments();
		expect(apiClient.getDocuments).toHaveBeenCalledTimes(1);

		vi.advanceTimersByTime(1);
		await getCachedDocuments();
		expect(apiClient.getDocuments).toHaveBeenCalledTimes(2);
	});

	it('refetches while the cached list is empty and returns [] on errors', async () => {
		vi.mocked(apiClient.getDocuments)
			.mockResolvedValueOnce([])
			.mockRejectedValueOnce(new Error('down'))
			.mockResolvedValueOnce([{ id: 2 }] as never);

		await expect(getCachedDocuments()).resolves.toEqual([]);
		await expect(getCachedDocuments()).resolves.toEqual([]);
		await expect(getCachedDocuments()).resolves.toEqual([{ id: 2 }]);
		expect(apiClient.getDocuments).toHaveBeenCalledTimes(3);
	});

	it('caches tags the same way', async () => {
		vi.mocked(apiClient.getAllTags)
			.mockRejectedValueOnce(new Error('down'))
			.mockResolvedValue({ tags: [{ name: 'go', count: 2 }] } as never);

		await expect(getCachedTags()).resolves.toEqual([]);
		await expect(getCachedTags()).resolves.toEqual([{ name: 'go', count: 2 }]);
		await getCachedTags();
		expect(apiClient.getAllTags).toHaveBeenCalledTimes(2);

		vi.advanceTimersByTime(60001);
		await getCachedTags();
		expect(apiClient.getAllTags).toHaveBeenCalledTimes(3);
	});
});
