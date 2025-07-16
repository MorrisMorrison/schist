import type { PageLoad } from './$types.js';
import type { Page } from '$lib/api/types.js';
import { apiClient } from '$lib';

export const load: PageLoad = async () => {
	try {
		const pages: Page[] = (await apiClient.getPages()) || [];

		// Sort pages by updated date (most recent first) and take the first 5
		const recentPages = pages
			.sort((a, b) => {
				const dateA = new Date(a.metaData.updated || a.metaData.created || 0);
				const dateB = new Date(b.metaData.updated || b.metaData.created || 0);
				return dateB.getTime() - dateA.getTime();
			})
			.slice(0, 5);

		return {
			recentPages,
			totalPages: pages.length
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
