import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequestKey, requestDeduplicator } from './request-deduplication';

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

describe('requestDeduplicator', () => {
	beforeEach(() => {
		requestDeduplicator.clearAll();
	});

	afterEach(() => {
		vi.useRealTimers();
		requestDeduplicator.clearAll();
	});

	it('shares one in-flight request per key and forgets it once settled', async () => {
		const pending = deferred<string>();
		const fn = vi.fn(() => pending.promise);

		const a = requestDeduplicator.deduplicate('k', fn);
		const b = requestDeduplicator.deduplicate('k', fn);
		expect(fn).toHaveBeenCalledTimes(1);
		expect(requestDeduplicator.getCacheSize()).toBe(1);

		pending.resolve('done');
		await expect(Promise.all([a, b])).resolves.toEqual(['done', 'done']);
		expect(requestDeduplicator.getCacheSize()).toBe(0);

		await requestDeduplicator.deduplicate('k', async () => 'again');
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it('keeps different keys apart', async () => {
		const results = await Promise.all([
			requestDeduplicator.deduplicate('a', async () => 1),
			requestDeduplicator.deduplicate('b', async () => 2)
		]);

		expect(results).toEqual([1, 2]);
	});

	it('removes failed requests so the next call retries', async () => {
		const failing = vi.fn(async () => {
			throw new Error('boom');
		});

		await expect(requestDeduplicator.deduplicate('k', failing)).rejects.toThrow('boom');
		await expect(requestDeduplicator.deduplicate('k', async () => 'ok')).resolves.toBe('ok');
	});

	it('starts a new request when forced or when the entry is older than the TTL', async () => {
		vi.useFakeTimers();
		const first = deferred<number>();
		const fn = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(2);

		requestDeduplicator.deduplicate('k', fn);
		requestDeduplicator.deduplicate('k', fn, { force: true });
		expect(fn).toHaveBeenCalledTimes(2);

		const slow = deferred<number>();
		const fn2 = vi.fn().mockReturnValueOnce(slow.promise).mockResolvedValue(3);
		requestDeduplicator.deduplicate('t', fn2, { ttl: 100 });
		vi.advanceTimersByTime(101);
		await expect(requestDeduplicator.deduplicate('t', fn2, { ttl: 100 })).resolves.toBe(3);
		expect(fn2).toHaveBeenCalledTimes(2);

		// Entries older than the default 30s TTL are swept on the next call.
		vi.advanceTimersByTime(30001);
		requestDeduplicator.deduplicate('other', async () => 0);
		expect(requestDeduplicator.getCacheSize()).toBe(1);
		first.resolve(1);
		slow.resolve(1);
	});

	it('clears single entries', () => {
		requestDeduplicator.deduplicate('k', () => new Promise(() => {}));
		requestDeduplicator.clear('k');

		expect(requestDeduplicator.getCacheSize()).toBe(0);
	});
});

describe('createRequestKey', () => {
	it('combines method, endpoint and body', () => {
		expect(createRequestKey('/documents')).toBe('GET:/documents:');
		expect(createRequestKey('/documents', { method: 'POST', body: '{"a":1}' })).toBe(
			'POST:/documents:{"a":1}'
		);
	});

	it('serialises FormData deterministically, sorted by field', () => {
		const one = new FormData();
		one.append('b', '2');
		one.append('a', '1');
		one.append('file', new File(['abc'], 'x.png', { type: 'image/png' }));
		const two = new FormData();
		two.append('file', new File(['abc'], 'x.png', { type: 'image/png' }));
		two.append('a', '1');
		two.append('b', '2');

		const key = createRequestKey('/upload', { method: 'POST', body: one });
		expect(key).toBe('POST:/upload:a=1&b=2&file=[File:x.png:3:image/png]');
		expect(createRequestKey('/upload', { method: 'POST', body: two })).toBe(key);
	});

	it('describes other body types', () => {
		const params = new URLSearchParams({ q: 'x y' });
		expect(createRequestKey('/s', { body: params })).toBe('GET:/s:q=x+y');
		expect(createRequestKey('/s', { body: new Blob(['abcd'], { type: 'text/plain' }) })).toBe(
			'GET:/s:[Blob:text/plain:4]'
		);
		expect(createRequestKey('/s', { body: new ArrayBuffer(8) })).toBe('GET:/s:[ArrayBuffer:8]');
		expect(createRequestKey('/s', { body: { a: 1 } as unknown as BodyInit })).toBe(
			'GET:/s:{"a":1}'
		);

		const circular: Record<string, unknown> = {};
		circular.self = circular;
		expect(createRequestKey('/s', { body: circular as unknown as BodyInit })).toBe(
			'GET:/s:[Object]'
		);
		expect(createRequestKey('/s', { body: 42 as unknown as BodyInit })).toBe(
			'GET:/s:[UnknownBodyType:number]'
		);
	});
});
