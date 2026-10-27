import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Document } from '#lib/api/types.ts';

vi.mock('#lib/api/client.ts', () => ({
	apiClient: {
		getDocuments: vi.fn(),
		getDocumentByPath: vi.fn()
	}
}));

import { goto } from '$app/navigation';
import { apiClient } from '#lib/api/client.ts';
import {
	initializeMarkdownInteractions,
	parseMarkdownToBlocks,
	type BlockquoteBlock,
	type CodeBlock,
	type HtmlBlock,
	type ImageBlock,
	type ListBlock,
	type ParagraphBlock
} from './markdown-blocks';

const known = { metaData: { title: 'Known Page', path: '/known' }, content: '' } as Document;

describe('parseMarkdownToBlocks block types', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(apiClient.getDocuments).mockResolvedValue([known]);
		vi.mocked(apiClient.getDocumentByPath).mockResolvedValue(known);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('turns a paragraph holding only an image into an image block with its size', async () => {
		const blocks = (
			await parseMarkdownToBlocks(
				'![Diagram](/uploads/d.png "Overview|large")\n\n![Plain](/uploads/p.png)\n\n![T](/u/t.png "|small")'
			)
		).filter((b) => b.type !== 'html') as ImageBlock[];

		expect(blocks.map((b) => b.type)).toEqual(['image', 'image', 'image']);
		expect(blocks[0]).toMatchObject({
			href: '/uploads/d.png',
			text: 'Diagram',
			title: 'Overview',
			size: 'large'
		});
		expect(blocks[1]).toMatchObject({ href: '/uploads/p.png', title: undefined, size: undefined });
		expect(blocks[2]).toMatchObject({ title: undefined, size: 'small' });
	});

	it('keeps images mixed with text inside the paragraph', async () => {
		const [block] = (await parseMarkdownToBlocks('See ![x](/u/x.png) here')) as ParagraphBlock[];

		expect(block.type).toBe('paragraph');
		expect(block.text).toContain('<img src="/u/x.png" alt="x">');
	});

	it('highlights fenced code by language', async () => {
		const [block] = (await parseMarkdownToBlocks('```go\nfunc main() {}\n```')) as CodeBlock[];

		expect(block).toMatchObject({ type: 'code', code: 'func main() {}', language: 'go' });
		expect(block.highlighted).toContain('hljs-keyword');
	});

	it('renders blockquotes, raw html, rules and task lists', async () => {
		const blocks = await parseMarkdownToBlocks(
			[
				'> quoted **text** with [[Known Page]]',
				'',
				'<div class="note">raw</div>',
				'',
				'---',
				'',
				'- [x] done',
				'- [ ] todo'
			].join('\n')
		);

		const quote = blocks.find((b) => b.type === 'blockquote') as BlockquoteBlock;
		expect(quote.text).toContain('<strong>text</strong>');
		expect(quote.text).toContain('data-wiki-target="/known"');
		expect((blocks.find((b) => b.type === 'html') as HtmlBlock).html).toContain('class="note"');
		expect(blocks.some((b) => b.type === 'hr')).toBe(true);
		const list = blocks.find((b) => b.type === 'list') as ListBlock;
		expect(list.items.map((i) => [i.task, i.checked])).toEqual([
			[true, true],
			[true, false]
		]);
	});

	it('joins the paragraphs of a loose list item', async () => {
		const [list] = (await parseMarkdownToBlocks('- first para\n\n  second para\n')) as ListBlock[];

		expect(list.items[0].text).toContain('first para');
		expect(list.items[0].text).toContain('second para');
		expect(list.items[0].text).not.toContain('<p>');
	});

	it('marks links to missing documents as broken, pointing at the slug', async () => {
		vi.mocked(apiClient.getDocumentByPath).mockRejectedValue(new Error('404'));

		const [block] = (await parseMarkdownToBlocks('[[No Such Page]]')) as ParagraphBlock[];

		expect(block.text).toContain('broken-link');
		expect(block.text).toContain('data-wiki-target="/no-such-page"');
		expect(block.text).toContain('title="Document &quot;No Such Page&quot; does not exist"');
	});

	it('still renders links when the document list cannot be loaded', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.mocked(apiClient.getDocuments).mockRejectedValue(new Error('down'));

		const [block] = (await parseMarkdownToBlocks('[[Known Page|shown]]')) as ParagraphBlock[];

		expect(block.text).toContain('data-wiki-target="/known-page"');
		expect(block.text).toContain('>shown</span>');
	});

	it('reuses rendered inline markdown for repeated text', async () => {
		const first = await parseMarkdownToBlocks('# Same heading');
		const second = await parseMarkdownToBlocks('# Same heading');

		expect((second[0] as ParagraphBlock).text).toBe((first[0] as ParagraphBlock).text);
	});
});

describe('initializeMarkdownInteractions', () => {
	beforeEach(() => vi.clearAllMocks());

	function container(html: string) {
		const el = document.createElement('div');
		el.innerHTML = html;
		initializeMarkdownInteractions(el);
		return el;
	}

	it('opens existing documents and edits missing ones', () => {
		const el = container(
			'<span class="wiki-link" data-wiki-target="/known">a</span>' +
				'<span class="wiki-link broken-link" data-wiki-target="/new">b</span>' +
				'<span class="wiki-link">no target</span>'
		);
		const [ok, broken, bare] = el.querySelectorAll<HTMLElement>('.wiki-link');

		ok.click();
		broken.click();
		bare.click();

		expect(goto).toHaveBeenCalledTimes(2);
		expect(goto).toHaveBeenNthCalledWith(1, '/documents/known');
		expect(goto).toHaveBeenNthCalledWith(2, '/edit/new');
	});

	it('does not double-bind when called again', () => {
		const el = container('<span class="wiki-link" data-wiki-target="/known">a</span>');
		initializeMarkdownInteractions(el);

		el.querySelector<HTMLElement>('.wiki-link')!.click();

		expect(goto).toHaveBeenCalledTimes(1);
	});

	it('ignores a missing container', () => {
		expect(() => initializeMarkdownInteractions(null as unknown as HTMLElement)).not.toThrow();
	});
});
