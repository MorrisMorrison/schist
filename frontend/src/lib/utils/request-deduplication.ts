/**
 * Generic request deduplication utility
 * Prevents duplicate concurrent requests by caching pending promises
 */

interface RequestCacheEntry<T = unknown> {
	promise: Promise<T>;
	timestamp: number;
}

class RequestDeduplicator {
	private cache = new Map<string, RequestCacheEntry>();
	private readonly DEFAULT_TTL = 30000; // 30 seconds

	/**
	 * Execute a request with deduplication
	 * If an identical request is already in flight, returns the existing promise
	 *
	 * @param key - Unique identifier for the request
	 * @param requestFn - Function that returns the promise to execute
	 * @param options - Configuration options
	 * @returns Promise with the request result
	 */
	async deduplicate<T>(
		key: string,
		requestFn: () => Promise<T>,
		options: {
			ttl?: number;
			force?: boolean;
		} = {}
	): Promise<T> {
		const { ttl = this.DEFAULT_TTL, force = false } = options;

		// Clean expired entries
		this.cleanExpired();

		// If force is true, remove any existing cache entry
		if (force) {
			this.cache.delete(key);
		}

		// Check if request is already in progress
		const existing = this.cache.get(key);
		if (existing && !this.isExpired(existing, ttl)) {
			return existing.promise as Promise<T>;
		}

		// Create new request
		const promise = requestFn().finally(() => {
			// Clean up cache entry when request completes
			this.cache.delete(key);
		});

		// Store in cache
		this.cache.set(key, {
			promise,
			timestamp: Date.now()
		});

		return promise;
	}

	/**
	 * Clear a specific cache entry
	 */
	clear(key: string): void {
		this.cache.delete(key);
	}

	/**
	 * Clear all cache entries
	 */
	clearAll(): void {
		this.cache.clear();
	}

	/**
	 * Get current cache size (for debugging)
	 */
	getCacheSize(): number {
		return this.cache.size;
	}

	private isExpired(entry: RequestCacheEntry, ttl: number): boolean {
		return Date.now() - entry.timestamp > ttl;
	}

	private cleanExpired(): void {
		for (const [key, entry] of this.cache.entries()) {
			if (this.isExpired(entry, this.DEFAULT_TTL)) {
				this.cache.delete(key);
			}
		}
	}
}

// Export singleton instance
export const requestDeduplicator = new RequestDeduplicator();

/**
 * Utility function to create a cache key from URL and options
 */
export function createRequestKey(endpoint: string, options: RequestInit = {}): string {
	const method = options.method || 'GET';

	let body = '';
	if (options.body) {
		if (typeof options.body === 'string') {
			body = options.body;
		} else if (options.body instanceof FormData) {
			body = serializeFormData(options.body);
		} else if (options.body instanceof URLSearchParams) {
			body = options.body.toString();
		} else if (options.body instanceof Blob) {
			body = `[Blob:${options.body.type}:${options.body.size}]`;
		} else if (options.body instanceof ArrayBuffer) {
			body = `[ArrayBuffer:${options.body.byteLength}]`;
		} else if (typeof options.body === 'object') {
			try {
				body = JSON.stringify(options.body);
			} catch {
				body = '[Object]';
			}
		} else {
			body = `[UnknownBodyType:${typeof options.body}]`;
		}
	}
	return `${method}:${endpoint}:${body}`;
}

/**
 * Serialize FormData to a deterministic string for cache key generation
 */
function serializeFormData(formData: FormData): string {
	const entries: Array<[string, string]> = [];
	for (const [key, value] of formData.entries()) {
		if (typeof value === 'string') {
			entries.push([key, value]);
		} else if (value instanceof File) {
			entries.push([key, `[File:${value.name}:${value.size}:${value.type}]`]);
		} else {
			entries.push([key, `[Unknown:${typeof value}]`]);
		}
	}
	entries.sort((a, b) => a[0].localeCompare(b[0]));
	return entries.map(([k, v]) => `${k}=${v}`).join('&');
}
