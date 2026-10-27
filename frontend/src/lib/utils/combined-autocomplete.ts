import { autocompletion } from '@codemirror/autocomplete';
import type { CompletionResult, CompletionContext } from '@codemirror/autocomplete';

import { getCachedDocuments, getCachedTags } from '#lib/utils/markdown-cache.ts';
import { HASHTAG_PARTIAL_REGEX } from './hashtag-constants';

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
	const to = lineStart + cursorInLine;

	try {
		const documents = await getCachedDocuments();
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

async function hashtagCompletion(context: CompletionContext): Promise<CompletionResult | null> {
	const line = context.state.doc.lineAt(context.pos);
	const lineText = line.text;
	const lineStart = line.from;
	const cursorInLine = context.pos - lineStart;

	const beforeCursor = lineText.slice(0, cursorInLine);
	const hashMatch = beforeCursor.match(HASHTAG_PARTIAL_REGEX);

	if (!hashMatch) {
		return null;
	}

	const searchQuery = hashMatch[1];
	const from = lineStart + beforeCursor.length - hashMatch[0].length + 1;
	const to = context.pos;

	try {
		const tags = await getCachedTags();
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

async function combinedCompletion(context: CompletionContext): Promise<CompletionResult | null> {
	const hashtagResult = await hashtagCompletion(context);
	if (hashtagResult) {
		return hashtagResult;
	}

	const wikiLinkResult = await wikiLinkCompletion(context);
	if (wikiLinkResult) {
		return wikiLinkResult;
	}

	return null;
}

export function combinedAutocompletionExtension() {
	return autocompletion({
		maxRenderedOptions: 10,
		activateOnTyping: true,
		override: [combinedCompletion]
	});
}
