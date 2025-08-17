import { describe, it, expect, vi } from 'vitest';
import { configuredMarked } from './markdown';

// Mock the API client and dependencies
vi.mock('$lib/api/client', () => ({
	apiClient: {
		getAssetUrl: vi.fn().mockImplementation((path) => `https://example.com${path}`)
	}
}));

vi.mock('./markdown-config', () => ({
	highlightCode: vi.fn().mockImplementation((code, lang) => {
		return lang ? `<span class="hljs-${lang}">${code}</span>` : code;
	})
}));

// Mock DOM for escapeHtml function
Object.defineProperty(global, 'document', {
	value: {
		createElement: vi.fn().mockImplementation((tagName) => {
			if (tagName === 'div') {
				const div = {
					textContent: '',
					innerHTML: ''
				};
				Object.defineProperty(div, 'textContent', {
					set: function (value) {
						// Simple mock of textContent setting
						this.innerHTML = value
							.replace(/&/g, '&amp;')
							.replace(/</g, '&lt;')
							.replace(/>/g, '&gt;')
							.replace(/"/g, '&quot;')
							.replace(/'/g, '&#39;');
					}
				});
				return div;
			}
			return {};
		})
	}
});

describe('Markdown Renderer', () => {
	describe('Image Rendering', () => {
		it('should render basic image with default size', () => {
			const markdown = '![Alt text](test-image.jpg)';
			const html = configuredMarked(markdown);

			expect(html).toContain('<img');
			expect(html).toContain('alt="Alt text"');
			expect(html).toContain('src="test-image.jpg"');
			expect(html).toContain('max-w-[75%]'); // default size
			expect(html).toContain('data-lightbox="true"');
		});

		it('should handle image with title', () => {
			const markdown = '![Alt text](test.jpg "Image title")';
			const html = configuredMarked(markdown);

			expect(html).toContain('title="Image title"');
			expect(html).toContain('alt="Alt text"');
		});

		it('should parse size from title with pipe separator', () => {
			const markdown = '![Alt text](test.jpg "Image title|small")';
			const html = configuredMarked(markdown);

			expect(html).toContain('title="Image title"');
			expect(html).toContain('max-w-[33%]'); // small size
		});

		it('should handle different size options', () => {
			const sizes = [
				{ size: 'small', expected: 'max-w-[33%]' },
				{ size: 'medium', expected: 'max-w-[50%]' },
				{ size: 'large', expected: 'max-w-[75%]' },
				{ size: 'full', expected: 'max-w-full' }
			];

			sizes.forEach(({ size, expected }) => {
				const markdown = `![Alt](test.jpg "Title|${size}")`;
				const html = configuredMarked(markdown);
				expect(html).toContain(expected);
			});
		});

		it('should handle custom pixel size', () => {
			const markdown = '![Alt](test.jpg "Title|300px")';
			const html = configuredMarked(markdown);

			expect(html).toContain('max-w-[300px]');
		});

		it('should handle custom percentage size', () => {
			const markdown = '![Alt](test.jpg "Title|80%")';
			const html = configuredMarked(markdown);

			expect(html).toContain('max-w-[80%]');
		});

		it('should handle numeric size as pixels', () => {
			const markdown = '![Alt](test.jpg "Title|400")';
			const html = configuredMarked(markdown);

			expect(html).toContain('max-w-[400px]');
		});

		it('should transform assets path to use API URL', () => {
			const markdown = '![Alt](/assets/image.jpg)';
			const html = configuredMarked(markdown);

			expect(html).toContain('src="https://example.com/assets/image.jpg"');
		});

		it('should include lightbox attributes', () => {
			const markdown = '![Alt](test.jpg)';
			const html = configuredMarked(markdown);

			expect(html).toContain('data-lightbox="true"');
			expect(html).toContain('data-original-src=');
			expect(html).toContain('data-fallback-text=');
			expect(html).toContain('cursor-pointer');
		});
	});

	describe('Code Block Rendering', () => {
		it('should render code block with language', () => {
			const markdown = '```javascript\nconsole.log("hello");\n```';
			const html = configuredMarked(markdown);

			expect(html).toContain('class="hljs language-javascript"');
			expect(html).toContain('<span class="code-lang');
			expect(html).toContain('>javascript</span>');
			expect(html).toContain('console.log("hello");');
		});

		it('should render code block without language', () => {
			const markdown = '```\nplain code\n```';
			const html = configuredMarked(markdown);

			expect(html).toContain('plain code');
			expect(html).toContain('class="hljs"');
			expect(html).not.toContain('language-');
		});

		it('should include copy button with escaped text', () => {
			const markdown = '```\ncode with "quotes" & <html>\n```';
			const html = configuredMarked(markdown);

			expect(html).toContain('copy-button');
			expect(html).toContain('data-copy-text=');
			expect(html).toContain('&quot;'); // escaped quotes
			expect(html).toContain('&lt;'); // escaped HTML
		});

		it('should have proper structure and classes', () => {
			const markdown = '```\ncode\n```';
			const html = configuredMarked(markdown);

			expect(html).toContain('code-block-container');
			expect(html).toContain('border rounded-lg');
			expect(html).toContain('<pre class="overflow-x-auto');
			expect(html).toContain('copy-icon');
		});
	});

	describe('Inline Code Rendering', () => {
		it('should render inline code with proper styling', () => {
			const markdown = 'Use `console.log()` for debugging';
			const html = configuredMarked(markdown);

			expect(html).toContain(
				'<code class="bg-muted px-1.5 py-0.5 rounded text-sm font-mono">console.log()</code>'
			);
		});

		it('should escape HTML in inline code', () => {
			const markdown = 'Use `<script>alert("xss")</script>` carefully';
			const html = configuredMarked(markdown);

			expect(html).toContain('&lt;script&gt;');
			expect(html).toContain('&quot;xss&quot;');
		});

		it('should escape special characters', () => {
			const markdown = 'Use `const x = \'value\' & "test"` in code';
			const html = configuredMarked(markdown);

			expect(html).toContain('&#39;value&#39;');
			expect(html).toContain('&quot;test&quot;');
		});
	});

	describe('General Markdown Features', () => {
		it('should handle line breaks', () => {
			const markdown = 'Line 1\nLine 2';
			const html = configuredMarked(markdown);

			expect(html).toContain('<br>');
		});

		it('should handle GitHub Flavored Markdown', () => {
			const markdown = '# Heading\n\n- List item\n- Another item\n\n**Bold** and *italic*';
			const html = configuredMarked(markdown);

			expect(html).toContain('<h1');
			expect(html).toContain('<ul>');
			expect(html).toContain('<li>');
			expect(html).toContain('<strong>Bold</strong>');
			expect(html).toContain('<em>italic</em>');
		});

		it('should handle mixed content', () => {
			const markdown = `
# Heading

Some text with \`inline code\` and a link.

\`\`\`javascript
function hello() {
  console.log("world");
}
\`\`\`

![Image](test.jpg "Test image|medium")
			`.trim();

			const html = configuredMarked(markdown);

			// Should contain all elements
			expect(html).toContain('<h1');
			expect(html).toContain('<code class="bg-muted');
			expect(html).toContain('language-javascript');
			expect(html).toContain('<img');
			expect(html).toContain('max-w-[50%]');
		});
	});

	describe('Security and Escaping', () => {
		it('should escape malicious HTML in code copy data', () => {
			const markdown = '```\n<script>alert("xss")</script>\n```';
			const html = configuredMarked(markdown);

			// The copy data should be properly escaped
			expect(html).toContain(
				'data-copy-text="&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;"'
			);
		});

		it('should escape quotes in copy button data', () => {
			const markdown = '```\ncode with "double" and \'single\' quotes\n```';
			const html = configuredMarked(markdown);

			expect(html).toContain('data-copy-text=');
			// Check that quotes are properly escaped in the data attribute
			expect(html).toMatch(/data-copy-text="[^"]*&quot;[^"]*"/);
		});

		it('should escape HTML entities in image attributes', () => {
			const markdown = '![Alt with "quotes"](test.jpg "Title with \'quotes\'")';
			const html = configuredMarked(markdown);

			expect(html).toContain('alt="Alt with &quot;quotes&quot;"');
			expect(html).toContain('title="Title with &#39;quotes&#39;"');
		});
	});
});
