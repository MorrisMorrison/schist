import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Document } from '#lib/api/types.ts';

vi.mock('#lib/api/client.ts', () => ({
	apiClient: {
		getDocuments: vi.fn(),
		getDocumentByPath: vi.fn()
	}
}));

import { apiClient } from '#lib/api/client.ts';
import {
	parseMarkdownToBlocks,
	type CodeBlock,
	type HeadingBlock,
	type ListBlock,
	type ParagraphBlock,
	type TableBlock
} from './markdown-blocks';

const relaunchDoc = {
	metaData: { title: 'Website relaunch', path: '/projects/website-relaunch' },
	content: ''
} as unknown as Document;

describe('parseMarkdownToBlocks', () => {
	beforeEach(() => {
		vi.mocked(apiClient.getDocuments).mockResolvedValue([relaunchDoc]);
		vi.mocked(apiClient.getDocumentByPath).mockResolvedValue(relaunchDoc);
	});

	describe('tables', () => {
		const table = [
			'| Folder | What |',
			'|---|---|',
			'| **Guides** | linked from [[Website relaunch]] |'
		].join('\n');

		it('renders inline markdown inside table cells', async () => {
			const [block] = (await parseMarkdownToBlocks(table)) as TableBlock[];

			expect(block.type).toBe('table');
			expect(block.rows[0][0]).toBe('<strong>Guides</strong>');
		});

		it('resolves wiki links inside table cells instead of leaking the placeholder', async () => {
			const [block] = (await parseMarkdownToBlocks(table)) as TableBlock[];
			const cell = block.rows[0][1];

			expect(cell).not.toContain('PLACEHOLDER');
			expect(cell).toContain('data-wiki-target="/projects/website-relaunch"');
			expect(cell).toContain('>Website relaunch</span>');
		});

		it('renders inline markdown in header cells', async () => {
			const [block] = (await parseMarkdownToBlocks(
				'| *Name* | `code` |\n|---|---|\n| a | b |'
			)) as TableBlock[];

			expect(block.header).toEqual(['<em>Name</em>', '<code>code</code>']);
		});
	});

	describe('wiki links and code', () => {
		beforeEach(() => {
			vi.mocked(apiClient.getDocuments).mockResolvedValue([
				{ metaData: { title: 'Writing style', path: '/writing-style' }, content: '' },
				{ metaData: { title: 'Deployment checklist', path: '/deployment-checklist' }, content: '' }
			] as unknown as Document[]);
		});

		it('leaves [[ inside inline code alone and resolves the links after it', async () => {
			const [block] = (await parseMarkdownToBlocks(
				'Type `[[` and a page title to link it, like [[Writing style]] or [[Deployment checklist]].'
			)) as ParagraphBlock[];
			const doc = new DOMParser().parseFromString(block.text, 'text/html');

			expect(doc.querySelector('code')?.textContent).toBe('[[');
			const links = Array.from(doc.querySelectorAll('.wiki-link'));
			expect(links.map((l) => l.textContent)).toEqual(['Writing style', 'Deployment checklist']);
			expect(links.map((l) => l.getAttribute('data-wiki-target'))).toEqual([
				'/writing-style',
				'/deployment-checklist'
			]);
			expect(doc.querySelector('.broken-link')).toBeNull();
			expect(block.text).not.toContain('PLACEHOLDER');
		});

		it('keeps a whole wiki link inside inline code literal', async () => {
			const [block] = (await parseMarkdownToBlocks(
				'Write ``[[Writing style]]`` to get [[Writing style]].'
			)) as ParagraphBlock[];
			const doc = new DOMParser().parseFromString(block.text, 'text/html');

			expect(doc.querySelector('code')?.textContent).toBe('[[Writing style]]');
			expect(doc.querySelectorAll('.wiki-link')).toHaveLength(1);
		});

		it('keeps wiki links in fenced code blocks literal', async () => {
			const blocks = await parseMarkdownToBlocks(
				[
					'```md',
					'See [[Writing style]]',
					'```',
					'',
					'~~~',
					'[[Deployment checklist]]',
					'~~~',
					'',
					'After [[Writing style]]'
				].join('\n')
			);
			const code = blocks.filter((b) => b.type === 'code') as CodeBlock[];
			const paragraph = blocks.find((b) => b.type === 'paragraph') as ParagraphBlock;

			expect(code.map((c) => c.code)).toEqual([
				'See [[Writing style]]',
				'[[Deployment checklist]]'
			]);
			expect(paragraph.text).toContain('data-wiki-target="/writing-style"');
		});
	});

	it('resolves wiki links in headings and list items', async () => {
		const blocks = await parseMarkdownToBlocks(
			'# See [[Website relaunch]]\n\n- item [[Website relaunch]]\n'
		);
		const heading = blocks.find((b) => b.type === 'heading') as HeadingBlock;
		const list = blocks.find((b) => b.type === 'list') as ListBlock;

		expect(heading.text).not.toContain('PLACEHOLDER');
		expect(heading.text).toContain('wiki-link');
		expect(list.items[0].text).not.toContain('PLACEHOLDER');
		expect(list.items[0].text).toContain('wiki-link');
	});

	describe('link resolution cost', () => {
		beforeEach(() => {
			vi.mocked(apiClient.getDocuments).mockClear();
			vi.mocked(apiClient.getDocumentByPath).mockClear();
			vi.mocked(apiClient.getDocuments).mockResolvedValue([
				{ metaData: { title: 'Writing style', path: '/writing-style' }, content: '' },
				{ metaData: { title: 'Router', path: '/devices/router' }, content: '' }
			] as unknown as Document[]);
		});

		it('resolves every link from one page list, without fetching linked pages', async () => {
			const blocks = await parseMarkdownToBlocks(
				[
					'# [[Writing style]]',
					'',
					'See [[Writing style]], [[router|the router]] and [[Missing page]].',
					'',
					'- [[Router]]',
					'',
					'| a |',
					'|---|',
					'| [[Writing style]] |'
				].join('\n')
			);
			const html = blocks
				.map((b) =>
					b.type === 'list'
						? (b as ListBlock).items.map((i) => i.text).join(' ')
						: b.type === 'table'
							? (b as TableBlock).rows.flat().join(' ')
							: (b as ParagraphBlock).text
				)
				.join(' ');
			const doc = new DOMParser().parseFromString(html, 'text/html');

			expect(apiClient.getDocuments).toHaveBeenCalledTimes(1);
			expect(apiClient.getDocumentByPath).not.toHaveBeenCalled();
			expect(html).not.toContain('PLACEHOLDER');

			const targets = Array.from(doc.querySelectorAll('.wiki-link')).map((l) =>
				l.getAttribute('data-wiki-target')
			);
			expect(targets).toEqual([
				'/writing-style',
				'/writing-style',
				'/devices/router',
				'/missing-page',
				'/devices/router',
				'/writing-style'
			]);
			const broken = Array.from(doc.querySelectorAll('.broken-link')).map((l) => l.textContent);
			expect(broken).toEqual(['Missing page']);
		});

		it('styles links through the theme, not hard-coded colour classes', async () => {
			const [block] = (await parseMarkdownToBlocks(
				'[[Writing style]] and [[Missing page]]'
			)) as ParagraphBlock[];
			const doc = new DOMParser().parseFromString(block.text, 'text/html');
			const [ok, broken] = Array.from(doc.querySelectorAll('.wiki-link'));

			expect(ok.className).toBe('wiki-link');
			expect(broken.className).toBe('wiki-link broken-link');
		});

		it('still renders the text when the page list fails', async () => {
			vi.mocked(apiClient.getDocuments).mockRejectedValue(new Error('offline'));
			const [block] = (await parseMarkdownToBlocks(
				'Read [[Writing style]] first.'
			)) as ParagraphBlock[];

			expect(block.text).toContain('Read ');
			expect(block.text).toContain('>Writing style</span>');
			expect(block.text).toContain('data-wiki-target="/writing-style"');
			expect(apiClient.getDocumentByPath).not.toHaveBeenCalled();
		});
	});

	it('escapes wiki link display text and target in the generated HTML', async () => {
		vi.mocked(apiClient.getDocuments).mockResolvedValue([]);
		const [block] = (await parseMarkdownToBlocks(
			'[[a"b|<img src=x onerror=alert(1)>]]'
		)) as ParagraphBlock[];

		expect(block.text).not.toContain('<img');
		expect(block.text).toContain('&lt;img src=x onerror=alert(1)&gt;');
		expect(block.text).not.toMatch(/title="[^"]*a"b/);
	});
});
