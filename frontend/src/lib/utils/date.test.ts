import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatDate, formatRelativeDate } from './date';

const NOW = new Date('2026-06-15T12:00:00Z');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

describe('formatRelativeDate', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(NOW);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('returns an empty string without a date', () => {
		expect(formatRelativeDate()).toBe('');
		expect(formatRelativeDate('')).toBe('');
	});

	it('says Today for anything within the last 24 hours', () => {
		expect(formatRelativeDate(ago(0))).toBe('Today');
		expect(formatRelativeDate(ago(5 * 60 * 1000))).toBe('Today');
		expect(formatRelativeDate(ago(3 * HOUR))).toBe('Today');
		expect(formatRelativeDate(ago(23 * HOUR))).toBe('Today');
	});

	it('says Yesterday for 1 to 2 days ago', () => {
		expect(formatRelativeDate(ago(DAY))).toBe('Yesterday');
		expect(formatRelativeDate(ago(DAY + 3 * HOUR))).toBe('Yesterday');
	});

	it('counts whole days, weeks and months elapsed', () => {
		expect(formatRelativeDate(ago(2 * DAY + HOUR))).toBe('2 days ago');
		expect(formatRelativeDate(ago(6 * DAY + HOUR))).toBe('6 days ago');
		expect(formatRelativeDate(ago(7 * DAY))).toBe('1 week ago');
		expect(formatRelativeDate(ago(8 * DAY))).toBe('1 week ago');
		expect(formatRelativeDate(ago(15 * DAY))).toBe('2 weeks ago');
		expect(formatRelativeDate(ago(30 * DAY))).toBe('1 month ago');
		expect(formatRelativeDate(ago(45 * DAY))).toBe('1 month ago');
		expect(formatRelativeDate(ago(100 * DAY))).toBe('3 months ago');
	});

	it('shows the calendar date for anything a year or older', () => {
		expect(formatRelativeDate('2024-03-05T12:00:00Z')).toBe('Mar 5, 2024');
	});
});

describe('formatDate', () => {
	it('formats with the locale and handles a missing date', () => {
		const iso = '2024-03-05T12:00:00Z';
		expect(formatDate(iso)).toBe(new Date(iso).toLocaleDateString());
		expect(formatDate()).toBe('');
	});
});
