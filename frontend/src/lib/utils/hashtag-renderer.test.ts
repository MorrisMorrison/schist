import { describe, it, expect } from 'vitest';
import { mapProse, processHashtags } from './hashtag-renderer';

/** The tags processHashtags turned into badges, in order. */
function badges(markdown: string): string[] {
	return [...processHashtags(markdown).matchAll(/title="Tag: ([^"]+)"/g)].map((m) => m[1]);
}

describe('processHashtags', () => {
	it('turns tags in prose into badges', () => {
		const html = processHashtags('Notes on #go and #rust-lang.');
		expect(badges('Notes on #go and #rust-lang.')).toEqual(['go', 'rust-lang']);
		expect(html).toContain('>#go</span>');
		expect(html.startsWith('Notes on <span')).toBe(true);
	});

	it('leaves fenced code blocks untouched', () => {
		const markdown = [
			'#before',
			'```mermaid',
			'style A fill:#f9f,stroke:#333',
			'```',
			'~~~bash',
			'# a shell comment #tag',
			'~~~',
			'````md',
			'```',
			'#nested',
			'```',
			'````',
			'#after'
		].join('\n');

		expect(badges(markdown)).toEqual(['before', 'after']);
		expect(processHashtags(markdown)).toContain('style A fill:#f9f,stroke:#333');
	});

	it('leaves inline code untouched', () => {
		expect(badges('Use `#fff` or ``a #b ` c`` but #real')).toEqual(['real']);
		expect(processHashtags('color `#fff`')).toBe('color `#fff`');
	});

	it('treats an unclosed fence as code to the end', () => {
		expect(badges('#yes\n```\n#no')).toEqual(['yes']);
	});

	it('only matches tags that start a word', () => {
		expect(badges('fill:#fff page#install a#b (#ok) "#quoted" start #fine')).toEqual([
			'ok',
			'quoted',
			'fine'
		]);
		expect(badges('#first word')).toEqual(['first']);
		expect(badges('# Heading')).toEqual([]);
	});
});

describe('mapProse', () => {
	it('passes prose and code to their own functions', () => {
		const seen: string[] = [];
		const out = mapProse(
			'a `x` b\n```\ncode\n```\nc',
			(prose) => prose.toUpperCase(),
			(code) => {
				seen.push(code);
				return code;
			}
		);
		expect(out).toBe('A `x` B\n```\ncode\n```\nC');
		// In document order: the prose before the block, then the block.
		expect(seen).toEqual(['`x`', '```\ncode\n```']);
	});
});
