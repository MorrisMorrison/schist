import { api } from '$lib/api.js';
import type { PageLoad } from './$types.js';

export const load: PageLoad = async () => {
	try {
		const pagesResponse = await api.getPages();

		// Sort pages alphabetically by title
		const sortedPages = pagesResponse.pages.sort((a, b) => a.title.localeCompare(b.title));

		return {
			pages: sortedPages,
			total: pagesResponse.total
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
