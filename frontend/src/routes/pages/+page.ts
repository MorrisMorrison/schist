import type { PageLoad } from './$types.js';
import { apiClient } from '$lib';

export const load: PageLoad = async () => {
	try {
		const [documents, folders] = await Promise.all([
			apiClient.getDocuments(),
			apiClient.getFolderTree()
		]);

		return {
			documents: documents || [],
			folders: folders || [],
			total: documents?.length || 0
		};
	} catch (error) {
		console.error('Failed to load documents and folders:', error);
		return {
			documents: [],
			folders: [],
			total: 0,
			error: 'Failed to load documents and folders'
		};
	}
};
