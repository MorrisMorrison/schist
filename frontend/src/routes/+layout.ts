import { apiClient } from "$lib";

export async function load() {
  const pages = await apiClient.getPages();
  return { pages };
}