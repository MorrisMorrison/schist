import { apiClient } from '$lib/api/client';
import type { Document, TagInfo } from '$lib/api/types';

const CACHE_DURATION = 60000;

let documentsCache: Document[] = [];
let documentsCacheTime = 0;

let tagsCache: TagInfo[] = [];
let tagsCacheTime = 0;

/**
 * Fetch documents with a 60s TTL cache shared across the markdown editor
 * extensions (wiki links + autocomplete).
 *
 * Refetches when the cache is stale or empty. On error it logs a warning and
 * returns an empty array without updating the cache timestamp (so the next
 * call retries).
 */
export async function getCachedDocuments(): Promise<Document[]> {
	const now = Date.now();
	if (now - documentsCacheTime > CACHE_DURATION || documentsCache.length === 0) {
		try {
			documentsCache = await apiClient.getDocuments();
			documentsCacheTime = now;
		} catch (error) {
			console.warn('Failed to fetch documents for markdown cache:', error);
			return [];
		}
	}
	return documentsCache;
}

/**
 * Fetch tags with a 60s TTL cache shared across the markdown editor extensions
 * (hashtag decorations + autocomplete).
 *
 * Refetches when the cache is stale or empty. On error it logs a warning and
 * returns an empty array without updating the cache timestamp (so the next
 * call retries).
 */
export async function getCachedTags(): Promise<TagInfo[]> {
	const now = Date.now();
	if (now - tagsCacheTime > CACHE_DURATION || tagsCache.length === 0) {
		try {
			const response = await apiClient.getAllTags();
			tagsCache = response.tags;
			tagsCacheTime = now;
		} catch (error) {
			console.warn('Failed to fetch tags for markdown cache:', error);
			return [];
		}
	}
	return tagsCache;
}
