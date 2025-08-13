import { HASHTAG_REGEX } from './hashtag-constants';

export function extractTitleFromContent(content: string): string {
	const lines = content.split('\n');

	for (const line of lines) {
		const trimmedLine = line.trim();

		if (trimmedLine.startsWith('#')) {
			const title = trimmedLine.replace(/^#+\s*/, '').trim();
			if (title.length > 0) {
				return title;
			}
		}
	}

	return 'Untitled Document';
}

export function excludeCodeBlocks(content: string): string {
	const withoutCodeBlocks = content.replace(/```[\s\S]*?```/g, '');

	const withoutInlineCode = withoutCodeBlocks.replace(/`[^`]*`/g, '');

	return withoutInlineCode;
}

export function extractHashtagsFromContent(content: string): string[] {
	const contentWithoutCode = excludeCodeBlocks(content);

	const matches = contentWithoutCode.match(HASHTAG_REGEX) || [];

	const tags = matches.map((tag) => tag.slice(1));
	return [...new Set(tags)];
}

export function getHashtagSuggestions(
	input: string,
	existingTags: string[],
	limit: number = 5
): string[] {
	if (!input) return [];

	const inputLower = input.toLowerCase();

	return existingTags.filter((tag) => tag.toLowerCase().includes(inputLower)).slice(0, limit);
}

export function hasHashtagsInContent(content: string): boolean {
	const contentWithoutCode = excludeCodeBlocks(content);
	return HASHTAG_REGEX.test(contentWithoutCode);
}

export interface ParsedDocumentMetadata {
	title: string;
	tags: string[];
}

export function parseDocumentMetadata(content: string): ParsedDocumentMetadata {
	const title = extractTitleFromContent(content);
	const tags = extractHashtagsFromContent(content);

	return {
		title,
		tags
	};
}
