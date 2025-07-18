import { error } from '@sveltejs/kit';
import type { PageLoad } from '../[slug]/$types.js';
import type { Page } from '$lib/api/types.js';
import { apiClient } from '$lib';

export const load: PageLoad = async ({ params }) => {
	const { path } = params;

	try {
		const page: Page = await apiClient.getPageByPath(path);
		return {
			page,
			path
		};
	} catch (err) {
		console.error('Failed to load page for editing:', err);

		// Re-throw SvelteKit errors as-is
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}

		// Convert other errors to SvelteKit errors
		throw error(500, 'Failed to load page for editing');
	}
};
