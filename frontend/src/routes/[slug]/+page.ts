import { api } from '$lib/api.js';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types.js';

export const load: PageLoad = async ({ params }) => {
	const { slug } = params;

	try {
		const page = await api.getPage(slug);

		return {
			page,
			slug
		};
	} catch (err) {
		// If the page doesn't exist (404), throw a SvelteKit error
		if (err instanceof Error && 'status' in err && err.status === 404) {
			throw error(404, {
				message: `Page "${slug}" not found`,
				slug
			});
		}

		// For other errors, also throw an error but with a generic message
		console.error('Failed to load page:', err);
		throw error(500, {
			message: 'Failed to load page',
			slug
		});
	}
};
