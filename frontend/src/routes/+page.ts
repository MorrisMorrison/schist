import type { PageLoad } from './$types.js';
import type { Page, Folder } from '$lib/api/types.js';
import { apiClient } from '$lib';

export const load: PageLoad = async () => {
	try {
		const [pagesResponse, foldersResponse] = await Promise.all([
			apiClient.getPages(),
			apiClient.getFolderTree()
		]);

		const pages: Page[] = pagesResponse || [];
		const folders: Folder[] = foldersResponse || [];

		return {
			pages,
			folders,
			totalPages: pages.length,
			totalFolders: folders.length
		};
	} catch (error) {
		console.error('Failed to load folder structure:', error);
		return {
			pages: [],
			folders: [],
			totalPages: 0,
			totalFolders: 0,
			error: 'Failed to load folder structure'
		};
	}
};
