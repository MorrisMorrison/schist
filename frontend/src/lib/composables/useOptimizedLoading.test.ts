import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useOptimizedLoading } from './useOptimizedLoading.svelte';

beforeEach(() => {
	vi.clearAllMocks();
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('useOptimizedLoading', () => {
	it('shows loading only for slow work, for at least the minimum time', async () => {
		vi.useFakeTimers();
		const loader = useOptimizedLoading(100, 50);

		loader.startLoading();
		vi.advanceTimersByTime(99);
		expect(loader.loading).toBe(false);
		vi.advanceTimersByTime(1);
		expect(loader.loading).toBe(true);

		loader.stopLoading();
		expect(loader.loading).toBe(true);
		vi.advanceTimersByTime(50);
		expect(loader.loading).toBe(false);
	});

	it('is safe to stop or clean up before starting, and cleanup cancels', () => {
		vi.useFakeTimers();
		const loader = useOptimizedLoading();

		loader.stopLoading();
		loader.cleanup();
		loader.startLoading();
		loader.cleanup();
		vi.advanceTimersByTime(1000);

		expect(loader.loading).toBe(false);
	});
});
