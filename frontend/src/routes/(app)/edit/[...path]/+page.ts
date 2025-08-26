import { error } from '@sveltejs/kit';
import type { Document } from '$lib/api/types';
import { apiClient } from '$lib';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params }) => {
	const { path } = params;

	try {
		const document: Document = await apiClient.getDocumentByPath(path);
		return {
			document,
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
