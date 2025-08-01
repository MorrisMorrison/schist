import type { PageLoad } from './$types.js';
import type { Document, Folder } from '$lib/api/types.js';
import { apiClient } from '$lib';

export const load: PageLoad = async () => {
	try {
		const [documentsResponse, foldersResponse] = await Promise.all([
			apiClient.getDocuments(),
			apiClient.getFolderTree()
		]);

		const documents: Document[] = documentsResponse || [];
		const folders: Folder[] = foldersResponse || [];

		return {
			documents,
			folders,
			totalDocuments: documents.length,
			totalFolders: folders.length
		};
	} catch (error) {
		console.error('Failed to load folder structure:', error);
		return {
			documents: [],
			folders: [],
			totalDocuments: 0,
			totalFolders: 0,
			error: 'Failed to load folder structure'
		};
	}
};
