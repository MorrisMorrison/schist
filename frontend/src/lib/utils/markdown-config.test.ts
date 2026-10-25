import { describe, it, expect } from 'vitest';
import { highlightCode } from './markdown-config';

describe('highlightCode', () => {
	it('highlights registered languages and aliases', () => {
		expect(highlightCode('const a = 1;', 'ts')).toContain(
			'<span class="hljs-keyword">const</span>'
		);
		expect(highlightCode('SELECT 1', 'sql')).toContain('hljs-keyword');
	});

	it('escapes code in unknown or missing languages', () => {
		expect(highlightCode(`<a href="x">'&'</a>`, 'brainfuck')).toBe(
			'&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;'
		);
		expect(highlightCode('<b>')).toBe('&lt;b&gt;');
	});
});
