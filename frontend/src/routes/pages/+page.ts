import type { PageLoad } from './$types.js';
import { apiClient } from '$lib';

export const load: PageLoad = async () => {
	try {
		const [pages, folders] = await Promise.all([apiClient.getPages(), apiClient.getFolderTree()]);

		return {
			pages: pages || [],
			folders: folders || [],
			total: pages?.length || 0
		};
	} catch (error) {
		console.error('Failed to load pages and folders:', error);
		return {
			pages: [],
			folders: [],
			total: 0,
			error: 'Failed to load pages and folders'
		};
	}
};
