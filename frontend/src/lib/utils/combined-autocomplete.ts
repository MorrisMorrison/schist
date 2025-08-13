import { autocompletion, CompletionContext } from '@codemirror/autocomplete';
import type { CompletionResult } from '@codemirror/autocomplete';

// Import completion functions from existing extensions
import { apiClient } from '$lib/api/client';
import type { TagInfo, Document } from '$lib/api/types';

// Cache for documents (from wiki-links)
let documentsCache: Document[] = [];
let documentsCacheTime = 0;

// Cache for tags (from hashtags)
let tagsCache: TagInfo[] = [];
let tagsCacheTime = 0;

const CACHE_DURATION = 60000; // 60 seconds

// Get documents for wiki-link completion
async function getDocuments(): Promise<Document[]> {
	const now = Date.now();
	if (now - documentsCacheTime > CACHE_DURATION || documentsCache.length === 0) {
		try {
			documentsCache = await apiClient.getDocuments();
			documentsCacheTime = now;
		} catch (error) {
			console.warn('Failed to fetch documents for wiki-link autocomplete:', error);
			return [];
		}
	}
	return documentsCache;
}

// Get tags for hashtag completion
async function getTags(): Promise<TagInfo[]> {
	const now = Date.now();
	if (now - tagsCacheTime > CACHE_DURATION || tagsCache.length === 0) {
		try {
			tagsCache = await apiClient.getTags();
			tagsCacheTime = now;
		} catch (error) {
			console.warn('Failed to fetch tags for hashtag autocomplete:', error);
			return [];
		}
	}
	return tagsCache;
}

// Wiki-link completion logic
async function wikiLinkCompletion(context: CompletionContext): Promise<CompletionResult | null> {
	const line = context.state.doc.lineAt(context.pos);
	const lineText = line.text;
	const lineStart = line.from;
	const cursorInLine = context.pos - lineStart;

	const beforeCursor = lineText.slice(0, cursorInLine);
	const afterCursor = lineText.slice(cursorInLine);

	const openBrackets = beforeCursor.lastIndexOf('[[');
	const closeBrackets = beforeCursor.lastIndexOf(']]');

	if (openBrackets === -1 || closeBrackets > openBrackets) {
		return null;
	}

	const nextCloseBrackets = afterCursor.indexOf(']]');
	if (nextCloseBrackets === -1) {
		return null;
	}

	const searchQuery = beforeCursor.slice(openBrackets + 2);
	const from = lineStart + openBrackets + 2;
	const to = lineStart + cursorInLine + nextCloseBrackets;

	try {
		const documents = await getDocuments();
		const filteredDocuments = documents.filter((doc) =>
			doc.metaData?.title?.toLowerCase().includes(searchQuery.toLowerCase())
		);

		const options = filteredDocuments.slice(0, 10).map((doc) => ({
			label: doc.metaData?.title || 'Untitled',
			type: 'text',
			detail: doc.metaData?.path || '',
			info:
				doc.content && doc.content.length > 100 ? doc.content.slice(0, 100) + '...' : doc.content,
			apply: doc.metaData?.title || 'Untitled'
		}));

		return {
			from,
			to,
			options
		};
	} catch (error) {
		console.warn('Error in wiki-link completion:', error);
		return null;
	}
}

// Hashtag completion logic
async function hashtagCompletion(context: CompletionContext): Promise<CompletionResult | null> {
	const line = context.state.doc.lineAt(context.pos);
	const lineText = line.text;
	const lineStart = line.from;
	const cursorInLine = context.pos - lineStart;

	const beforeCursor = lineText.slice(0, cursorInLine);
	const hashMatch = beforeCursor.match(/#([a-zA-Z0-9_-]*)$/);

	if (!hashMatch) {
		return null;
	}

	const searchQuery = hashMatch[1];
	const from = lineStart + beforeCursor.length - hashMatch[0].length + 1; // +1 to skip the #
	const to = context.pos;

	try {
		const tags = await getTags();
		const filteredTags = tags.filter((tag) =>
			tag.name.toLowerCase().includes(searchQuery.toLowerCase())
		);

		const options = filteredTags.slice(0, 10).map((tag) => ({
			label: tag.name,
			type: 'keyword',
			detail: `Used ${tag.count || 0} times`,
			apply: tag.name
		}));

		return {
			from,
			to,
			options
		};
	} catch (error) {
		console.warn('Error in hashtag completion:', error);
		return null;
	}
}

// Combined completion function
async function combinedCompletion(context: CompletionContext): Promise<CompletionResult | null> {
	// Try hashtag completion first (more specific pattern)
	const hashtagResult = await hashtagCompletion(context);
	if (hashtagResult) {
		return hashtagResult;
	}

	// Try wiki-link completion
	const wikiLinkResult = await wikiLinkCompletion(context);
	if (wikiLinkResult) {
		return wikiLinkResult;
	}

	return null;
}

// Export the combined autocompletion extension
export function combinedAutocompletionExtension() {
	return autocompletion({
		maxRenderedOptions: 10,
		activateOnTyping: true,
		override: [combinedCompletion]
	});
}
