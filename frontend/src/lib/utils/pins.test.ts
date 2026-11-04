import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Document, DocumentSummary } from '#lib/api/types.ts';

vi.mock('#lib/api/client.ts', () => ({
	apiClient: {
		getDocumentByPath: vi.fn(),
		updateDocumentByPath: vi.fn()
	}
}));

import { apiClient } from '#lib/api/client.ts';
import { isPinned, pinnedDocuments, setPinned } from './pins';

const summary = (title: string, path: string, properties?: Record<string, unknown>) =>
	({ metaData: { title, path, slug: path.slice(1), properties } }) as unknown as DocumentSummary;

describe('isPinned', () => {
	it.each([
		[{ pinned: true }, true],
		[{ pinned: 'true' }, true],
		[{ pinned: false }, false],
		[{ pinned: 'no' }, false],
		[{ other: 1 }, false],
		[undefined, false]
	])('%j → %s', (properties, expected) => {
		expect(isPinned(summary('A', '/a', properties as Record<string, unknown>))).toBe(expected);
	});
});

describe('pinnedDocuments', () => {
	it('returns the pinned pages sorted by title', () => {
		const docs = [
			summary('Zebra', '/z', { pinned: true }),
			summary('alpha', '/a', { pinned: true }),
			summary('Middle', '/m'),
			summary('Beta', '/b', { pinned: true })
		];
		expect(pinnedDocuments(docs).map((d) => d.metaData.title)).toEqual(['alpha', 'Beta', 'Zebra']);
	});
});

describe('setPinned', () => {
	const stored: Document = {
		metaData: {
			title: 'Router',
			path: '/devices/router',
			slug: 'router',
			tags: ['network'],
			properties: { role: 'gateway' }
		},
		content: '# Router\n\nText stays as it is.'
	} as Document;

	beforeEach(() => {
		vi.mocked(apiClient.getDocumentByPath).mockReset().mockResolvedValue(structuredClone(stored));
		vi.mocked(apiClient.updateDocumentByPath).mockReset().mockResolvedValue(stored);
	});

	it('adds pinned: true, keeping the other properties and the text', async () => {
		await setPinned('/devices/router', true);

		expect(apiClient.updateDocumentByPath).toHaveBeenCalledWith(
			'/devices/router',
			{
				metaData: expect.objectContaining({
					title: 'Router',
					tags: ['network'],
					properties: { role: 'gateway', pinned: true }
				}),
				content: '# Router\n\nText stays as it is.'
			},
			'manual'
		);
	});

	it('removes the property on unpin', async () => {
		vi.mocked(apiClient.getDocumentByPath).mockResolvedValue({
			...structuredClone(stored),
			metaData: { ...stored.metaData, properties: { role: 'gateway', pinned: true } }
		});
		await setPinned('/devices/router', false);

		const [, request] = vi.mocked(apiClient.updateDocumentByPath).mock.calls[0];
		expect(request.metaData.properties).toEqual({ role: 'gateway' });
	});

	it('sends an empty object when unpinning leaves no properties, so the key is cleared', async () => {
		vi.mocked(apiClient.getDocumentByPath).mockResolvedValue({
			...structuredClone(stored),
			metaData: { ...stored.metaData, properties: { pinned: true } }
		});
		await setPinned('/devices/router', false);

		const [, request] = vi.mocked(apiClient.updateDocumentByPath).mock.calls[0];
		expect(request.metaData.properties).toEqual({});
	});

	it('saves nothing when the page is already in that state', async () => {
		await setPinned('/devices/router', false);
		expect(apiClient.updateDocumentByPath).not.toHaveBeenCalled();
	});
});
