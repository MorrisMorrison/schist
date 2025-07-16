import type { PageLoad } from './$types.js';
import type { Page } from '$lib/api/types.js';
import { apiClient } from '$lib';

export const load: PageLoad = async () => {
	try {
		const pages: Page[] = (await apiClient.getPages()) || [];

		// Sort pages alphabetically by title
		const sortedPages = pages.sort((a, b) => a.metaData.title.localeCompare(b.metaData.title));

		return {
			pages: sortedPages,
			total: pages.length
		};
	} catch (error) {
		console.error('Failed to load pages:', error);
		return {
			pages: [],
			total: 0,
			error: 'Failed to load pages'
		};
	}
};
