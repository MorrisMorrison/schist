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
	const body = options.body ? (typeof options.body === 'string' ? options.body : '[FormData]') : '';
	return `${method}:${endpoint}:${body}`;
}
