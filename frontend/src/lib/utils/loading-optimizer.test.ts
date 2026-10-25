import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LoadingStateOptimizer } from './loading-optimizer';

describe('LoadingStateOptimizer', () => {
	let updates: boolean[];
	let optimizer: LoadingStateOptimizer;

	beforeEach(() => {
		vi.useFakeTimers();
		updates = [];
		optimizer = new LoadingStateOptimizer((loading) => updates.push(loading));
	});

	afterEach(() => {
		optimizer.destroy();
		vi.useRealTimers();
	});

	it('never shows the loader for work that finishes within the delay', () => {
		optimizer.start();
		vi.advanceTimersByTime(199);
		optimizer.stop();
		vi.advanceTimersByTime(1000);

		expect(updates).toEqual([]);
	});

	it('shows after the delay and keeps it up for the minimum display time', () => {
		optimizer.start();
		vi.advanceTimersByTime(200);
		expect(updates).toEqual([true]);

		vi.advanceTimersByTime(50);
		optimizer.stop();
		expect(updates).toEqual([true]);

		vi.advanceTimersByTime(99);
		expect(updates).toEqual([true]);
		vi.advanceTimersByTime(1);
		expect(updates).toEqual([true, false]);
	});

	it('hides immediately once the minimum display time has passed', () => {
		optimizer.start();
		vi.advanceTimersByTime(200 + 500);
		optimizer.stop();

		expect(updates).toEqual([true, false]);
	});

	it('honours custom timings and cancels on destroy', () => {
		const custom = new LoadingStateOptimizer((l) => updates.push(l), {
			delayMs: 10,
			minDisplayMs: 0
		});
		custom.start();
		vi.advanceTimersByTime(10);
		custom.stop();
		expect(updates).toEqual([true, false]);

		custom.start();
		custom.destroy();
		vi.advanceTimersByTime(100);
		expect(updates).toEqual([true, false]);
	});
});
