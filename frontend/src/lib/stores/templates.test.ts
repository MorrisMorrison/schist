import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('#lib/api/client.ts', () => ({
	apiClient: { getTemplates: vi.fn() }
}));

import { apiClient } from '#lib/api/client.ts';
import { templateActions, templatesStore } from './templates.svelte';

const api = vi.mocked(apiClient);

beforeEach(() => {
	vi.clearAllMocks();
	vi.spyOn(console, 'warn').mockImplementation(() => {});
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('templates store', () => {
	beforeEach(() => templatesStore.clearTemplates());

	it('loads templates once unless forced', async () => {
		api.getTemplates.mockResolvedValue([{ name: 'Meeting' }] as never);

		await templatesStore.loadTemplates();
		await templatesStore.loadTemplates();
		expect(api.getTemplates).toHaveBeenCalledTimes(1);
		expect(api.getTemplates).toHaveBeenCalledWith(false);
		expect(templatesStore.templates).toEqual([{ name: 'Meeting' }]);
		expect(templatesStore.loaded).toBe(true);

		await templateActions.loadTemplates(true);
		expect(api.getTemplates).toHaveBeenLastCalledWith(true);
	});

	it('does not start a second load while one is in flight', async () => {
		let resolve!: (t: never) => void;
		api.getTemplates.mockImplementationOnce(() => new Promise((r) => (resolve = r)));

		const first = templatesStore.loadTemplates();
		expect(templatesStore.loading).toBe(true);
		await templatesStore.loadTemplates();
		resolve([] as never);
		await first;

		expect(api.getTemplates).toHaveBeenCalledTimes(1);
	});

	it('stores the API error message and allows a retry', async () => {
		api.getTemplates.mockRejectedValueOnce(
			new Error(JSON.stringify({ error: 'Templates folder missing', code: 'RESOURCE_NOT_FOUND' }))
		);

		await templatesStore.loadTemplates();

		expect(templatesStore.error).toBe('Templates folder missing');
		expect(templatesStore.loaded).toBe(false);
		expect(templatesStore.templates).toEqual([]);

		api.getTemplates.mockResolvedValueOnce([{ name: 'Daily' }] as never);
		await templatesStore.loadTemplates();
		expect(templatesStore.error).toBeNull();
		expect(templatesStore.loaded).toBe(true);
	});
});
