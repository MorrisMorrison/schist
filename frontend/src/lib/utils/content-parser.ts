import { HASHTAG_REGEX } from './hashtag-constants';
import { mapProse } from './hashtag-renderer';

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

/** The prose of markdown: fenced code blocks and inline code removed. */
export function excludeCodeBlocks(content: string): string {
	return mapProse(
		content,
		(prose) => prose,
		() => ''
	);
}

export function extractHashtagsFromContent(content: string): string[] {
	const contentWithoutCode = excludeCodeBlocks(content);

	const matches = contentWithoutCode.match(HASHTAG_REGEX) || [];

	const tags = matches.map((tag) => tag.slice(1));
	return [...new Set(tags)];
}
