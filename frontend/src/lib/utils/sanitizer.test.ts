import { describe, it, expect } from 'vitest';
import { sanitizeHtml } from './sanitizer';

describe('sanitizer', () => {
	it('should allow checkbox input elements', () => {
		const input =
			'<ul><li><input type="checkbox" checked disabled> Checked task</li><li><input type="checkbox" disabled> Unchecked task</li></ul>';
		const result = sanitizeHtml(input);

		// Should preserve checkbox inputs
		expect(result).toContain('<input type="checkbox" checked disabled>');
		expect(result).toContain('<input type="checkbox" disabled>');

		// Should preserve the structure
		expect(result).toContain('<ul>');
		expect(result).toContain('<li>');
		expect(result).toContain('Checked task');
		expect(result).toContain('Unchecked task');
	});

	it('should sanitize malicious input elements but preserve checkboxes', () => {
		const input =
			'<ul><li><input type="checkbox" checked disabled> Safe checkbox</li><li><input type="text" onclick="alert(\'hack\')" value="dangerous"> Bad input</li></ul>';
		const result = sanitizeHtml(input);

		// Should preserve safe checkbox
		expect(result).toContain('<input type="checkbox" checked disabled>');
		expect(result).toContain('Safe checkbox');

		// Should remove dangerous input and its attributes
		expect(result).not.toContain('onclick');
		expect(result).not.toContain('alert');
		expect(result).not.toContain('type="text"');
	});

	it('should preserve task list formatting', () => {
		const input =
			'<ul><li><input type="checkbox" checked disabled> <strong>Bold</strong> task with <em>emphasis</em></li></ul>';
		const result = sanitizeHtml(input);

		expect(result).toContain('<input type="checkbox" checked disabled>');
		expect(result).toContain('<strong>Bold</strong>');
		expect(result).toContain('<em>emphasis</em>');
	});
});
