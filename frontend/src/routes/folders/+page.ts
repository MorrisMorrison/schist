import type { PageLoad } from './$types';
import { apiClient } from '$lib/api/client';

export const load: PageLoad = async ({ fetch }) => {
  const [pages, folders] = await Promise.all([
    apiClient.getPages(),
    apiClient.getFolderTree()
  ]);

  return {
    pages,
    folders
  };
};