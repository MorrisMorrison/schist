import { apiClient } from '$lib/api/client';
import type { PageData } from './$types';

export async function load(): Promise<PageData> {
	try {
		const response = await apiClient.getPages();
		
		// Sort by updated date (most recent first)
		const sortedPages = response.sort((a, b) => {
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
}