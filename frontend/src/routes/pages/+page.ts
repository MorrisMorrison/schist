import { PUBLIC_API_URL } from '$env/static/public';
import type { PageLoad } from './$types.js';
import type { Page, PageListResponse } from '$lib/api/types.js';

export const load: PageLoad = async ({ fetch }) => {
	const apiUrl = PUBLIC_API_URL || 'http://localhost:8080/api';
	
	try {
		const response = await fetch(`${apiUrl}/pages`);
		
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const data: PageListResponse = await response.json();
		const pages: Page[] = data.pages || [];

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
