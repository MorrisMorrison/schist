import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/svelte';
import type { Document } from '$lib/api/types';

vi.mock('$lib/api/client', () => ({
	apiClient: {
		getDocuments: vi.fn(),
		getDocumentByPath: vi.fn(),
		getAssetUrl: vi.fn((path: string) => path)
	}
}));

import { goto } from '$app/navigation';
import { apiClient } from '$lib/api/client';
import { render } from '$lib/test/component-utils';
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
