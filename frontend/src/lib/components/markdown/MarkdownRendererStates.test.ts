import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';

vi.mock('#lib/api/client.ts', () => ({ apiClient: {} }));

vi.mock('#lib/utils/markdown-blocks.ts', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/utils/markdown-blocks.ts')>()),
	parseMarkdownToBlocks: vi.fn()
}));

import { goto } from '$app/navigation';
import { parseMarkdownToBlocks, type MarkdownBlock } from '#lib/utils/markdown-blocks.ts';
import MarkdownRenderer from './MarkdownRenderer.svelte';

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => (resolve = r));
	return { promise, resolve };
}

describe('MarkdownRenderer states', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
		vi.restoreAllMocks();
	});

	it('shows a placeholder for empty content without parsing', () => {
		render(MarkdownRenderer, { props: { content: '' } });

		expect(screen.getByText('No content to display')).toBeInTheDocument();
		expect(parseMarkdownToBlocks).not.toHaveBeenCalled();
	});

	it('shows Loading while parsing', async () => {
		const parsed = deferred<MarkdownBlock[]>();
		vi.mocked(parseMarkdownToBlocks).mockReturnValue(parsed.promise);
		render(MarkdownRenderer, { props: { content: 'x' } });

		expect(screen.getByText('Loading...')).toBeInTheDocument();
		parsed.resolve([]);
		expect(await screen.findByText('No content to display')).toBeInTheDocument();
	});

	it('shows an error when parsing fails', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.mocked(parseMarkdownToBlocks).mockRejectedValue(new Error('bad'));

		render(MarkdownRenderer, { props: { content: 'x' } });

		expect(await screen.findByText('Failed to parse markdown content')).toBeInTheDocument();
	});

	it('renders a fallback for unknown block types', async () => {
		vi.mocked(parseMarkdownToBlocks).mockResolvedValue([
			{ type: 'mystery', id: 'm1' } as unknown as MarkdownBlock
		]);

		render(MarkdownRenderer, { props: { content: 'x' } });

		expect(await screen.findByText('Unknown block type: mystery')).toBeInTheDocument();
	});

	it('ignores results from content that has since changed', async () => {
		const first = deferred<MarkdownBlock[]>();
		vi.mocked(parseMarkdownToBlocks)
			.mockReturnValueOnce(first.promise)
			.mockResolvedValueOnce([
				{ type: 'paragraph', id: 'b', text: 'second', raw: 'second' } as MarkdownBlock
			]);
		const { rerender } = render(MarkdownRenderer, { props: { content: 'first' } });

		await rerender({ content: 'second' });
		expect(await screen.findByText('second')).toBeInTheDocument();
		first.resolve([{ type: 'paragraph', id: 'a', text: 'first', raw: 'first' } as MarkdownBlock]);

		await new Promise((r) => setTimeout(r, 10));
		expect(screen.queryByText('first')).not.toBeInTheDocument();
	});

	it('ignores a stale parse failure', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		let rejectFirst!: (e: Error) => void;
		vi.mocked(parseMarkdownToBlocks)
			.mockReturnValueOnce(new Promise((_, reject) => (rejectFirst = reject)))
			.mockResolvedValueOnce([
				{ type: 'paragraph', id: 'b', text: 'fresh', raw: 'fresh' } as MarkdownBlock
			]);
		const { rerender } = render(MarkdownRenderer, { props: { content: 'one' } });

		await rerender({ content: 'two' });
		expect(await screen.findByText('fresh')).toBeInTheDocument();
		rejectFirst(new Error('late'));

		await new Promise((r) => setTimeout(r, 10));
		expect(error).not.toHaveBeenCalled();
		expect(screen.getByText('fresh')).toBeInTheDocument();
	});

	it('delegates wiki link clicks in non-paragraph blocks, skipping broken links', async () => {
		vi.mocked(parseMarkdownToBlocks).mockResolvedValue([
			{
				type: 'heading',
				id: 'h',
				level: 2,
				text: '<span class="wiki-link" data-wiki-target="/a">A</span> <span class="wiki-link broken-link" data-wiki-target="/b">B</span> plain',
				raw: ''
			} as MarkdownBlock
		]);
		const { container } = render(MarkdownRenderer, { props: { content: 'x' } });
		await screen.findByText('A');
		const [good, broken] = container.querySelectorAll<HTMLElement>('.wiki-link');

		broken.click();
		expect(goto).not.toHaveBeenCalled();

		container.querySelector('h2')!.click();
		expect(goto).not.toHaveBeenCalled();

		good.click();
		expect(goto).toHaveBeenCalledWith('/documents/a');
	});
});
