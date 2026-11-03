import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/svelte';
import type { Document } from '#lib/api/types.ts';

vi.mock('#lib/api/client.ts', () => ({
	apiClient: {
		getDocuments: vi.fn(),
		getDocumentByPath: vi.fn(),
		getAssetUrl: vi.fn((path: string) => path)
	}
}));

import { goto } from '$app/navigation';
import { apiClient } from '#lib/api/client.ts';
import { render } from '#lib/test/component-utils.ts';
import MarkdownRenderer from './MarkdownRenderer.svelte';

const doc = {
	metaData: { title: 'Website relaunch', path: '/projects/website-relaunch' },
	content: ''
} as unknown as Document;

async function renderAndFindLink(content: string) {
	const { container } = render(MarkdownRenderer, { props: { content } });
	let link: HTMLElement | null = null;
	await waitFor(() => {
		link = container.querySelector<HTMLElement>('.wiki-link');
		expect(link).not.toBeNull();
	});
	return { container, link: link! };
}

describe('MarkdownRenderer wiki link navigation', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
		vi.mocked(goto).mockClear();
		vi.mocked(apiClient.getDocuments).mockResolvedValue([doc]);
		vi.mocked(apiClient.getDocumentByPath).mockResolvedValue(doc);
	});

	it('navigates when a wiki link inside a table cell is clicked', async () => {
		const { container, link } = await renderAndFindLink(
			'| What |\n|---|\n| see [[Website relaunch]] |'
		);
		expect(container.querySelector('td .wiki-link')).toBe(link);

		link.click();

		expect(goto).toHaveBeenCalledTimes(1);
		expect(goto).toHaveBeenCalledWith('/documents/projects/website-relaunch');
	});

	it('navigates once for a wiki link in a paragraph', async () => {
		const { link } = await renderAndFindLink('see [[Website relaunch]]');

		link.click();

		expect(goto).toHaveBeenCalledTimes(1);
		expect(goto).toHaveBeenCalledWith('/documents/projects/website-relaunch');
	});
});

describe('MarkdownRenderer code blocks', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
		vi.mocked(apiClient.getDocuments).mockResolvedValue([]);
	});

	it('draws mermaid blocks as diagrams and leaves other code as code', async () => {
		const { container } = render(MarkdownRenderer, {
			props: {
				content: '```mermaid\ngraph LR\n  A[Beds] --> B[Compost]\n```\n\n```js\nconst a = 1;\n```'
			}
		});

		await waitFor(
			() => expect(container.querySelector('[data-testid="mermaid-diagram"] svg')).not.toBeNull(),
			{ timeout: 10000 }
		);
		const blocks = container.querySelectorAll('.code-block-container');
		expect(blocks).toHaveLength(2);
		expect(blocks[0]).toHaveAttribute('data-testid', 'mermaid-block');
		expect(blocks[1]).not.toHaveAttribute('data-testid', 'mermaid-block');
		expect(blocks[1]).toHaveTextContent('const a = 1;');
	});
});
