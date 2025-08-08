import { error } from '@sveltejs/kit';
import { apiClient } from '$lib/api/client';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params }) => {
	try {
		const document = await apiClient.getSharedDocument(params.token);
		return {
			document,
			isShared: true
		};
	} catch (err) {
		console.error('Failed to load shared document:', err);
		throw error(404, 'Shared document not found or has expired');
	}
};
