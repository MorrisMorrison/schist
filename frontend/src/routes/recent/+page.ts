import { apiClient } from '$lib/api/client';
import type { PageLoad } from './$types';

export const load: PageLoad = async () => {
	try {
		const response = await apiClient.getDocuments();

		const documentsWithoutTrash = response.filter(
			(document) => !document.metaData.path.includes('/trash')
		);

		const sortedDocuments = documentsWithoutTrash.sort((a, b) => {
			const dateA = new Date(a.metaData.updated || a.metaData.created || '').getTime();
			const dateB = new Date(b.metaData.updated || b.metaData.created || '').getTime();
			return dateB - dateA;
		});

		const recentDocuments = sortedDocuments.slice(0, 10);

		return {
			recentDocuments,
			totalDocuments: response.length,
			error: null
		};
	} catch (error) {
		console.error('Failed to load recent documents:', error);
		return {
			recentDocuments: [],
			totalDocuments: 0,
			error: error instanceof Error ? error.message : 'Unknown error'
		};
	}
};
