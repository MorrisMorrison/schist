import type { Document } from '$lib/api/types';

interface SearchResult {
	document: Document;
	score: number;
	matches: {
		title: boolean;
		path: boolean;
		content: boolean;
		tags: boolean;
	};
}

/**
 * Simple fuzzy matching score calculation
 * Returns a score from 0-1 where 1 is the best match
 */
function calculateFuzzyScore(query: string, text: string): number {
	const queryLower = query.toLowerCase();
	const textLower = text.toLowerCase();

	// Exact match gets highest score
	if (textLower === queryLower) return 1.0;

	// Check if query is a substring
	if (textLower.includes(queryLower)) {
		// Score based on position and length ratio
		const position = textLower.indexOf(queryLower);
		const lengthRatio = queryLower.length / textLower.length;

		// Earlier position and higher length ratio = better score
		const positionScore = 1 - position / textLower.length;
		return 0.7 + 0.3 * positionScore * lengthRatio;
	}

	// Check character sequence matching
	let queryIndex = 0;
	let matches = 0;

	for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
		if (textLower[i] === queryLower[queryIndex]) {
			matches++;
			queryIndex++;
		}
	}

	// All characters found in sequence
	if (queryIndex === queryLower.length) {
		const sequenceScore = matches / Math.max(queryLower.length, textLower.length);
		return 0.3 * sequenceScore;
	}

	return 0;
}

/**
 * Enhanced document search with fuzzy matching and scoring
 */
export function fuzzySearchDocuments(documents: Document[], query: string): Document[] {
	if (!query.trim()) return [];

	const results: SearchResult[] = [];
	const queryLower = query.toLowerCase().trim();

	for (const document of documents) {
		let totalScore = 0;
		const matches = {
			title: false,
			path: false,
			content: false,
			tags: false
		};

		// Search in title (highest weight)
		const titleScore = calculateFuzzyScore(queryLower, document.metaData.title);
		if (titleScore > 0) {
			totalScore += titleScore * 3;
			matches.title = true;
		}

		// Search in path (medium weight)
		const pathScore = calculateFuzzyScore(queryLower, document.metaData.path || '');
		if (pathScore > 0) {
			totalScore += pathScore * 2;
			matches.path = true;
		}

		// Search in tags (medium weight)
		if (document.metaData.tags) {
			let tagScore = 0;
			for (const tag of document.metaData.tags) {
				tagScore = Math.max(tagScore, calculateFuzzyScore(queryLower, tag));
			}
			if (tagScore > 0) {
				totalScore += tagScore * 2;
				matches.tags = true;
			}
		}

		// Search in content (lower weight)
		if (document.content) {
			const contentScore = calculateFuzzyScore(queryLower, document.content);
			if (contentScore > 0) {
				totalScore += contentScore * 1;
				matches.content = true;
			}
		}

		// Only include documents with some match
		if (totalScore > 0) {
			results.push({
				document,
				score: totalScore,
				matches
			});
		}
	}

	// Sort by score (highest first) and return documents
	return results.sort((a, b) => b.score - a.score).map((result) => result.document);
}

/**
 * Highlight matching text in search results
 */
export function highlightMatches(text: string, query: string): string {
	if (!query.trim()) return text;

	const queryLower = query.toLowerCase();
	const textLower = text.toLowerCase();

	// Simple substring highlighting
	const index = textLower.indexOf(queryLower);
	if (index !== -1) {
		const before = text.substring(0, index);
		const match = text.substring(index, index + query.length);
		const after = text.substring(index + query.length);

		return `${before}<mark class="bg-yellow-200 dark:bg-yellow-900">${match}</mark>${after}`;
	}

	return text;
}

/**
 * Extract recent documents from localStorage
 */
export function getRecentDocumentPaths(): string[] {
	try {
		const stored = localStorage.getItem('recent-documents');
		return stored ? JSON.parse(stored) : [];
	} catch {
		return [];
	}
}

/**
 * Add document to recent list
 */
export function addToRecentDocuments(path: string): void {
	try {
		let recent = getRecentDocumentPaths();

		// Remove if already exists and add to front
		recent = recent.filter((p) => p !== path);
		recent.unshift(path);

		// Keep only last 20
		recent = recent.slice(0, 20);

		localStorage.setItem('recent-documents', JSON.stringify(recent));
	} catch (error) {
		console.error('Failed to update recent documents:', error);
	}
}
