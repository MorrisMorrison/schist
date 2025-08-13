/**
 * Content parsing utilities for extracting metadata from markdown content
 * Used for Obsidian-like editing experience with hashtag-based tagging
 */

/**
 * Extracts the document title from markdown content
 * Uses the first heading (H1-H6) found in the content
 * Falls back to "Untitled Document" if no heading is found
 */
export function extractTitleFromContent(content: string): string {
	const lines = content.split('\n');

	for (const line of lines) {
		const trimmedLine = line.trim();

		// Check if line starts with heading markdown
		if (trimmedLine.startsWith('#')) {
			const title = trimmedLine.replace(/^#+\s*/, '').trim();
			if (title.length > 0) {
				return title;
			}
		}
	}

	return 'Untitled Document';
}

/**
 * Excludes code blocks and inline code from content before hashtag parsing
 * This prevents hashtags in code from being treated as actual tags
 */
export function excludeCodeBlocks(content: string): string {
	// Remove triple-backtick code blocks
	const withoutCodeBlocks = content.replace(/```[\s\S]*?```/g, '');

	// Remove inline code spans
	const withoutInlineCode = withoutCodeBlocks.replace(/`[^`]*`/g, '');

	return withoutInlineCode;
}

/**
 * Extracts hashtags from markdown content
 * Ignores hashtags within code blocks and inline code
 * Returns unique tags without the # prefix
 */
export function extractHashtagsFromContent(content: string): string[] {
	// First remove code blocks to avoid parsing hashtags in code
	const contentWithoutCode = excludeCodeBlocks(content);

	// Match hashtags: # followed by alphanumeric, underscore, or dash
	// Must not be followed by another word character to avoid partial matches
	const hashtagRegex = /#([a-zA-Z0-9_-]+)(?!\w)/g;

	const matches = contentWithoutCode.match(hashtagRegex) || [];

	// Remove # prefix and deduplicate
	const tags = matches.map((tag) => tag.slice(1));
	return [...new Set(tags)];
}

/**
 * Gets hashtag suggestions based on input and existing tags
 * Used for autocomplete functionality in the editor
 */
export function getHashtagSuggestions(
	input: string,
	existingTags: string[],
	limit: number = 5
): string[] {
	if (!input) return [];

	const inputLower = input.toLowerCase();

	return existingTags.filter((tag) => tag.toLowerCase().includes(inputLower)).slice(0, limit);
}

/**
 * Checks if content has any hashtags
 * Useful for migration or conditional logic
 */
export function hasHashtagsInContent(content: string): boolean {
	const contentWithoutCode = excludeCodeBlocks(content);
	const hashtagRegex = /#([a-zA-Z0-9_-]+)(?!\w)/g;
	return hashtagRegex.test(contentWithoutCode);
}

/**
 * Type for parsed document metadata extracted from content
 */
export interface ParsedDocumentMetadata {
	title: string;
	tags: string[];
}

/**
 * Parses markdown content and extracts all metadata
 * Returns title and tags in one operation
 */
export function parseDocumentMetadata(content: string): ParsedDocumentMetadata {
	const title = extractTitleFromContent(content);
	const tags = extractHashtagsFromContent(content);

	return {
		title,
		tags
	};
}
