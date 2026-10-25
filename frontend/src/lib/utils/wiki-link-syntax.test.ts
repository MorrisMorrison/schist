import { describe, it, expect } from 'vitest';
import { findWikiLinkMatches, replaceWikiLinks } from './wiki-link-syntax';

const targets = (text: string) => findWikiLinkMatches(text).map((m) => m.target);

describe('findWikiLinkMatches', () => {
	it('finds links with offsets and optional display text', () => {
		const text = 'a [[One]] b [[Two|Shown]]';

		expect(findWikiLinkMatches(text)).toEqual([
			{ from: 2, to: 9, target: 'One', display: undefined },
			{ from: 12, to: 25, target: 'Two', display: 'Shown' }
		]);
	});

	it('skips inline code spans of any backtick length', () => {
		expect(targets('`[[` then [[A]]')).toEqual(['A']);
		expect(targets('``[[B]]`` and `x` [[C]]')).toEqual(['C']);
		expect(targets('``a ` [[D]]`` [[E]]')).toEqual(['E']);
	});

	it('treats an unmatched backtick as plain text', () => {
		expect(targets('it`s [[A]]')).toEqual(['A']);
	});

	it('does not let an inline code span cross a blank line', () => {
		expect(targets('a `x\n\n[[A]] `')).toEqual(['A']);
	});

	it('skips fenced code blocks, including tilde, indented and longer fences', () => {
		const text = [
			'```js',
			'[[A]]',
			'```',
			'[[B]]',
			'  ~~~',
			'[[C]]',
			'  ~~~',
			'````',
			'```',
			'[[D]]',
			'````',
			'[[E]]'
		].join('\n');

		expect(targets(text)).toEqual(['B', 'E']);
	});

	it('runs an unterminated fence to the end of the text', () => {
		expect(targets('[[A]]\n```\n[[B]]')).toEqual(['A']);
	});

	it('only treats backticks at the start of a line as a fence', () => {
		expect(targets('x ```[[A]]``` [[B]]')).toEqual(['B']);
	});
});

describe('replaceWikiLinks', () => {
	it('replaces links outside code and keeps code verbatim', () => {
		const result = replaceWikiLinks(
			'Type `[[` like [[A|x]].\n\n```\n[[B]]\n```',
			(target, display) => `<${target}:${display ?? ''}>`
		);

		expect(result).toBe('Type `[[` like <A:x>.\n\n```\n[[B]]\n```');
	});
});
