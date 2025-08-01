import { apiClient } from '$lib';

export async function load() {
	const documents = await apiClient.getDocuments();
	return { documents };
}
