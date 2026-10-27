import type { PageLoad } from './$types';
import { apiClient } from '#lib/api/client.ts';
import { error } from '@sveltejs/kit';
import type { Folder, Document } from '#lib/api/types.ts';

export const load: PageLoad = async ({ params }) => {
	const pathSegments = params.path.split('/').filter(Boolean);
	const fullPath = '/' + pathSegments.join('/');

	try {
		// First, try to load as a folder
		const [allDocuments, allFolders] = await Promise.all([
			apiClient.getDocuments(),
			apiClient.getFolderTree()
		]);

		// Check if this path corresponds to a folder
		const findFolderByPath = (folders: Folder[], targetPath: string): Folder | null => {
			for (const folder of folders) {
				if (folder.path === targetPath) {
					return folder;
				}
				if (folder.sub_folders && folder.sub_folders.length > 0) {
					const found = findFolderByPath(folder.sub_folders, targetPath);
					if (found) return found;
				}
			}
			return null;
		};

		const folder = findFolderByPath(allFolders, fullPath);

		if (folder) {
			// This is a folder - filter documents and subfolders for this path
			const folderDocuments = allDocuments?.filter(
				(document: Document) =>
					document.metaData?.path === fullPath ||
					(fullPath === '/' && !document.metaData?.path?.includes('/'))
			);

			return {
				isFolder: true,
				path: fullPath,
				folderName: folder.name,
				documents: folderDocuments,
				folders: allFolders,
				currentFolder: folder
			};
		}

		// If not a folder, try to load as a document
		try {
			const document = await apiClient.getDocumentByPath(fullPath);
			return {
				isFolder: false,
				path: fullPath,
				document: document
			};
		} catch {
			// Neither folder nor document found
			throw error(404, 'Folder or document not found');
		}
	} catch (err) {
		console.error('Error loading folder/document:', err);
		throw error(500, 'Failed to load content');
	}
};
