import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types.js';
import type { Page } from '$lib/api/types.js';
import { apiClient } from '$lib/api/client.js';

export const load: PageLoad = async ({ params }) => {
	const { slug } = params;

	try {
		const page: Page = await apiClient.getPage(slug);

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
