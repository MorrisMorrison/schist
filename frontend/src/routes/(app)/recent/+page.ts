import { authService } from '$lib/auth/auth-service';
import { apiClient } from '$lib/api/client';
import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ url }) => {
	await authService.initialize();

	if (authService.isAuthEnabled()) {
		const isAuthenticated = await authService.requireAuth(url.pathname);
		if (!isAuthenticated) {
			throw redirect(303, `/login?returnUrl=${encodeURIComponent(url.pathname)}`);
		}
	}

	try {
		const [documents, folders] = await Promise.all([
			apiClient.getDocuments(),
			apiClient.getFolderTree()
		]);

		return {
			documents: documents || [],
			folders: folders || []
		};
	} catch (error) {
		console.error('Failed to load recent page data:', error);
		return {
			documents: [],
			folders: [],
			loadError: 'Failed to load documents. Please refresh the page.'
		};
	}
};
