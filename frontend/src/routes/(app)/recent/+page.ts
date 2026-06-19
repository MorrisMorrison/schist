import { apiClient } from '$lib/api/client';
import type { PageLoad } from './$types';

// Auth is handled by the (app) group layout (see (app)/+layout.ts).
export const load: PageLoad = async () => {
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
