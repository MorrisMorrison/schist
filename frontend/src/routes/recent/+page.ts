import { apiClient } from '$lib/api/client';
import type { PageLoad } from './$types';

export const load: PageLoad = async () => {
	try {
		const response = await apiClient.getPages();

		const pagesWithoutTrash = response.filter((page) => !page.metaData.path.includes('/trash'));

		// Sort by updated date (most recent first)
		const sortedPages = pagesWithoutTrash.sort((a, b) => {
			const dateA = new Date(a.metaData.updated || a.metaData.created || '').getTime();
			const dateB = new Date(b.metaData.updated || b.metaData.created || '').getTime();
			return dateB - dateA;
		});

		// Take first 10 pages
		const recentPages = sortedPages.slice(0, 10);

		return {
			recentPages,
			totalPages: response.length,
			error: null
		};
	} catch (error) {
		console.error('Failed to load recent pages:', error);
		return {
			recentPages: [],
			totalPages: 0,
			error: error instanceof Error ? error.message : 'Unknown error'
		};
	}
};
