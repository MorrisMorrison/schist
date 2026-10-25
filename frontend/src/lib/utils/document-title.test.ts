import { describe, expect, it } from 'vitest';
import { stripLeadingTitleHeading } from './document-title';

describe('stripLeadingTitleHeading', () => {
	it('drops a leading H1 that repeats the title', () => {
		expect(stripLeadingTitleHeading('# Getting started\n\nWelcome.', 'Getting started')).toBe(
			'Welcome.'
		);
	});

	it('ignores case, surrounding spaces, blank lines before it and CRLF', () => {
		expect(
			stripLeadingTitleHeading('\r\n  #   getting STARTED  \r\n\r\nBody', 'Getting started')
		).toBe('Body');
	});

	it('keeps an H1 that differs from the title', () => {
		const md = '# Overview\n\nBody';
		expect(stripLeadingTitleHeading(md, 'Getting started')).toBe(md);
	});

	it('keeps the heading when it is not the first content', () => {
		const md = 'Intro line\n\n# Getting started\n';
		expect(stripLeadingTitleHeading(md, 'Getting started')).toBe(md);
	});

	it('only strips level-one headings', () => {
		const md = '## Getting started\n\nBody';
		expect(stripLeadingTitleHeading(md, 'Getting started')).toBe(md);
	});

	it('handles a document that is only the title', () => {
		expect(stripLeadingTitleHeading('# Getting started', 'Getting started')).toBe('');
	});

	it('leaves content alone without a title', () => {
		expect(stripLeadingTitleHeading('# Anything\n', '')).toBe('# Anything\n');
	});
});
