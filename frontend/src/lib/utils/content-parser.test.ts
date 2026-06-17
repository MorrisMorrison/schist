import { describe, it, expect } from 'vitest';
import {
	extractTitleFromContent,
	excludeCodeBlocks,
	extractHashtagsFromContent
} from './content-parser';

describe('Content Parser', () => {
	describe('extractTitleFromContent', () => {
		it('should extract title from H1 heading', () => {
			const content = '# My Title\n\nSome content here.';
			expect(extractTitleFromContent(content)).toBe('My Title');
		});

		it('should extract title from H2 heading if no H1', () => {
			const content = 'Some text\n## Secondary Title\n\nContent';
			expect(extractTitleFromContent(content)).toBe('Secondary Title');
		});

		it('should extract title from first heading found', () => {
			const content = '### First Heading\n## Second Heading\n# Third Heading';
			expect(extractTitleFromContent(content)).toBe('First Heading');
		});

		it('should handle multiple hash symbols', () => {
			const content = '#### Deep Title\n\nContent here.';
			expect(extractTitleFromContent(content)).toBe('Deep Title');
		});

		it('should trim whitespace from title', () => {
			const content = '#   Spaced Title   \n\nContent';
			expect(extractTitleFromContent(content)).toBe('Spaced Title');
		});

		it('should return default title when no heading found', () => {
			const content = 'Just some text without headings\n\nMore text.';
			expect(extractTitleFromContent(content)).toBe('Untitled Document');
		});

		it('should return default title for empty content', () => {
			expect(extractTitleFromContent('')).toBe('Untitled Document');
		});

		it('should return default title for heading with only hashes', () => {
			const content = '###   \n\nSome content';
			expect(extractTitleFromContent(content)).toBe('Untitled Document');
		});

		it('should handle content with no newlines', () => {
			const content = '# Single Line Title';
			expect(extractTitleFromContent(content)).toBe('Single Line Title');
		});
	});

	describe('excludeCodeBlocks', () => {
		it('should remove code blocks', () => {
			const content = 'Text before\n```\ncode here\n```\nText after';
			const result = excludeCodeBlocks(content);
			expect(result).toBe('Text before\n\nText after');
		});

		it('should remove multiple code blocks', () => {
			const content = '```js\nconsole.log("hello")\n```\nText\n```python\nprint("hi")\n```';
			const result = excludeCodeBlocks(content);
			expect(result).toBe('\nText\n');
		});

		it('should remove inline code', () => {
			const content = 'Use `console.log()` for debugging';
			const result = excludeCodeBlocks(content);
			expect(result).toBe('Use  for debugging');
		});

		it('should handle mixed code blocks and inline code', () => {
			const content = 'Text `inline` more text\n```\nblock code\n```\nend';
			const result = excludeCodeBlocks(content);
			expect(result).toBe('Text  more text\n\nend');
		});

		it('should handle content without code', () => {
			const content = 'Just regular text without any code';
			const result = excludeCodeBlocks(content);
			expect(result).toBe('Just regular text without any code');
		});

		it('should handle nested backticks correctly', () => {
			const content = 'Text ```code with `nested` backticks``` more text';
			const result = excludeCodeBlocks(content);
			expect(result).toBe('Text  more text');
		});
	});

	describe('extractHashtagsFromContent', () => {
		it('should extract hashtags from content', () => {
			const content = 'This is #tag1 and #tag2 in text';
			const tags = extractHashtagsFromContent(content);
			expect(tags).toEqual(['tag1', 'tag2']);
		});

		it('should handle hashtags with underscores and numbers', () => {
			const content = 'Tags like #tag_1 and #test123 are valid';
			const tags = extractHashtagsFromContent(content);
			expect(tags).toEqual(['tag_1', 'test123']);
		});

		it('should ignore hashtags in code blocks', () => {
			const content = 'Normal #tag but ignore ```\n#codeTag\n``` this one';
			const tags = extractHashtagsFromContent(content);
			expect(tags).toEqual(['tag']);
		});

		it('should ignore hashtags in inline code', () => {
			const content = 'Normal #tag but ignore `#inlineTag` this one';
			const tags = extractHashtagsFromContent(content);
			expect(tags).toEqual(['tag']);
		});

		it('should remove duplicate hashtags', () => {
			const content = 'Text with #duplicate and #duplicate tags';
			const tags = extractHashtagsFromContent(content);
			expect(tags).toEqual(['duplicate']);
		});

		it('should return empty array for content without hashtags', () => {
			const content = 'Content without any hashtags';
			const tags = extractHashtagsFromContent(content);
			expect(tags).toEqual([]);
		});

		it('should handle hashtags at start and end of lines', () => {
			const content = '#start\nText in middle\n#end';
			const tags = extractHashtagsFromContent(content);
			expect(tags).toEqual(['start', 'end']);
		});

		it('should not include hashtags that are part of markdown headers', () => {
			const content = '# Header\n\nText with #realtag here';
			const tags = extractHashtagsFromContent(content);
			expect(tags).toEqual(['realtag']);
		});
	});
});
