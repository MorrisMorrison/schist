import { api } from '$lib/api.js';
import type { PageLoad } from './$types.js';

export const load: PageLoad = async () => {
	try {
		const pagesResponse = await api.getPages();

		// Sort pages by updated date (most recent first) and take the first 5
		const recentPages = pagesResponse.pages
			.sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime())
			.slice(0, 5);

		return {
			recentPages,
			totalPages: pagesResponse.total
		};
	} catch (error) {
		console.error('Failed to load pages:', error);
		return {
			recentPages: [],
			totalPages: 0,
			error: 'Failed to load pages'
		};
	}
};
