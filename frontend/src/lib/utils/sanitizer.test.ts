import { describe, it, expect } from 'vitest';
import { sanitizeHtml } from './sanitizer';

describe('sanitizer', () => {
	it('should sanitize inline content for component rendering', () => {
		const input = '<strong>Bold</strong> text with <em>emphasis</em> and <code>code</code>';
		const result = sanitizeHtml(input);

		expect(result).toContain('<strong>Bold</strong>');
		expect(result).toContain('<em>emphasis</em>');
		expect(result).toContain('<code>code</code>');
	});

	it('should remove all input elements for security', () => {
		const input =
			'Text with <input type="checkbox" checked disabled> and <input type="text" onclick="alert(\'hack\')" value="dangerous">';
		const result = sanitizeHtml(input);

		expect(result).not.toContain('<input');
		expect(result).not.toContain('onclick');
		expect(result).not.toContain('alert');
		expect(result).toContain('Text with');
		expect(result).toContain('and');
	});

	it('should preserve safe inline formatting while removing dangerous elements', () => {
		const input =
			'<strong>Bold</strong> task with <script>alert("xss")</script> and <em>emphasis</em>';
		const result = sanitizeHtml(input);

		expect(result).toContain('<strong>Bold</strong>');
		expect(result).toContain('<em>emphasis</em>');
		expect(result).not.toContain('<script>');
		expect(result).not.toContain('alert');
		expect(result).toContain('task with');
	});

	it('should allow images with safe attributes', () => {
		const input = '<img src="/assets/image.png" alt="Test image" class="responsive">';
		const result = sanitizeHtml(input);

		expect(result).toContain('<img');
		expect(result).toContain('src="/assets/image.png"');
		expect(result).toContain('alt="Test image"');
		expect(result).toContain('class="responsive"');
	});

	it('should remove event handlers from all elements', () => {
		const input =
			'<a href="#" onclick="alert(\'hack\')">Link</a> and <span onmouseover="steal()">Span</span>';
		const result = sanitizeHtml(input);

		expect(result).toContain('<a href="#">Link</a>');
		expect(result).toContain('<span>Span</span>');
		expect(result).not.toContain('onclick');
		expect(result).not.toContain('onmouseover');
		expect(result).not.toContain('alert');
		expect(result).not.toContain('steal');
	});
});
