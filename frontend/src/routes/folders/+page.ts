import type { PageLoad } from './$types';
import { apiClient } from '$lib/api/client';

export const load: PageLoad = async () => {
	const [documents, folders] = await Promise.all([
		apiClient.getDocuments(),
		apiClient.getFolderTree()
	]);

	return {
		documents,
		folders
	};
};
