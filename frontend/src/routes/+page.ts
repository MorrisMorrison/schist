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
