import { error } from '@sveltejs/kit';
import { PUBLIC_API_URL } from '$env/static/public';
import type { PageLoad } from './$types.js';
import type { Page } from '$lib/api/types.js';

export const load: PageLoad = async ({ params, fetch }) => {
	const { slug } = params;
	const apiUrl = PUBLIC_API_URL || 'http://localhost:8080/api';

	try {
		const response = await fetch(`${apiUrl}/pages/${encodeURIComponent(slug)}`);
		
		if (!response.ok) {
			if (response.status === 404) {
				throw error(404, `Page "${slug}" not found`);
			}
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const page: Page = await response.json();

		return {
			page,
			slug
		};
	} catch (err) {
		console.error('Failed to load page:', err);
		
		// Re-throw SvelteKit errors as-is
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}
		
		// Convert other errors to SvelteKit errors
		throw error(500, 'Failed to load page');
	}
};
