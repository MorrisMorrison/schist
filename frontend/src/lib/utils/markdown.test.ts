import { describe, it, expect } from 'vitest';
import { configuredMarked } from './markdown';

describe('configuredMarked (Basic Inline Markdown Processing)', () => {
	describe('Inline Text Formatting', () => {
		it('should render bold text', () => {
			const markdown = '**bold text**';
			const html = configuredMarked(markdown);

			expect(html).toContain('<strong>bold text</strong>');
		});

		it('should render italic text', () => {
			const markdown = '*italic text*';
			const html = configuredMarked(markdown);

			expect(html).toContain('<em>italic text</em>');
		});

		it('should render inline code', () => {
			const markdown = 'Use `console.log()` for debugging';
			const html = configuredMarked(markdown);

			expect(html).toContain('<code>console.log()</code>');
		});

		it('should render links', () => {
			const markdown = '[GitHub](https://github.com)';
			const html = configuredMarked(markdown);

			expect(html).toContain('<a href="https://github.com">GitHub</a>');
		});

		it('should handle mixed inline formatting', () => {
			const markdown = 'Text with **bold**, *italic*, and `code`';
			const html = configuredMarked(markdown);

			expect(html).toContain('<strong>bold</strong>');
			expect(html).toContain('<em>italic</em>');
			expect(html).toContain('<code>code</code>');
		});
	});

	describe('Basic Block Elements', () => {
		it('should render headings', () => {
			const markdown = '# Heading 1';
			const html = configuredMarked(markdown);

			expect(html).toContain('<h1');
			expect(html).toContain('Heading 1');
		});

		it('should render paragraphs', () => {
			const markdown = 'This is a paragraph.';
			const html = configuredMarked(markdown);

			expect(html).toContain('<p>This is a paragraph.</p>');
		});

		it('should render basic lists', () => {
			const markdown = '- Item 1\n- Item 2';
			const html = configuredMarked(markdown);

			expect(html).toContain('<ul>');
			expect(html).toContain('<li>Item 1</li>');
			expect(html).toContain('<li>Item 2</li>');
		});

		it('should render basic images', () => {
			const markdown = '![Alt text](image.jpg)';
			const html = configuredMarked(markdown);

			expect(html).toContain('<img');
			expect(html).toContain('alt="Alt text"');
			expect(html).toContain('src="image.jpg"');
		});

		it('should render basic code blocks', () => {
			const markdown = '```\nconst x = 1;\n```';
			const html = configuredMarked(markdown);

			expect(html).toContain('<pre><code>');
			expect(html).toContain('const x = 1;');
		});
	});

	describe('GitHub Flavored Markdown', () => {
		it('should handle line breaks', () => {
			const markdown = 'Line 1\nLine 2';
			const html = configuredMarked(markdown);

			expect(html).toContain('<br>');
		});

		it('should handle task lists', () => {
			const markdown = '- [x] Completed\n- [ ] Todo';
			const html = configuredMarked(markdown);

			expect(html).toContain('<input');
			expect(html).toContain('type="checkbox"');
		});

		it('should handle strikethrough', () => {
			const markdown = '~~strikethrough~~';
			const html = configuredMarked(markdown);

			expect(html).toContain('<del>strikethrough</del>');
		});

		it('should handle tables', () => {
			const markdown = '| Col 1 | Col 2 |\n|-------|-------|\n| A | B |';
			const html = configuredMarked(markdown);

			expect(html).toContain('<table>');
			expect(html).toContain('<th>Col 1</th>');
			expect(html).toContain('<td>A</td>');
		});
	});

	describe('HTML Escaping and Security', () => {
		it('should escape HTML in inline code', () => {
			const markdown = 'Use `<script>alert("xss")</script>` carefully';
			const html = configuredMarked(markdown);

			expect(html).toContain('&lt;script&gt;');
			expect(html).toContain('&quot;xss&quot;');
		});

		it('should escape special characters in inline code', () => {
			const markdown = 'Use `const x = \'value\' & "test"` in code';
			const html = configuredMarked(markdown);

			expect(html).toContain('&#39;value&#39;');
			expect(html).toContain('&quot;test&quot;');
		});

		it('should handle HTML entities in text', () => {
			const markdown = 'Text with & < > " \' characters';
			const html = configuredMarked(markdown);

			expect(html).toContain('&amp;');
			expect(html).toContain('&lt;');
			expect(html).toContain('&gt;');
		});
	});

	describe('Configuration Options', () => {
		it('should have GitHub Flavored Markdown enabled', () => {
			// Test strikethrough which is GFM-specific
			const markdown = '~~deleted~~';
			const html = configuredMarked(markdown);

			expect(html).toContain('<del>deleted</del>');
		});

		it('should have line breaks enabled', () => {
			const markdown = 'First line\nSecond line';
			const html = configuredMarked(markdown);

			expect(html).toContain('<br>');
		});

		it('should preserve basic markdown structure', () => {
			const markdown = '# Title\n\nParagraph with **bold** text.\n\n- List item';
			const html = configuredMarked(markdown);

			expect(html).toContain('<h1');
			expect(html).toContain('<p>');
			expect(html).toContain('<strong>bold</strong>');
			expect(html).toContain('<ul>');
			expect(html).toContain('<li>');
		});
	});
});
