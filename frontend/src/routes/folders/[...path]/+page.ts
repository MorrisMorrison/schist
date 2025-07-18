import type { PageLoad } from './$types';
import { apiClient } from '$lib/api/client';
import { error } from '@sveltejs/kit';

export const load: PageLoad = async ({ params, fetch }) => {
  const pathSegments = params.path.split('/').filter(Boolean);
  const fullPath = '/' + pathSegments.join('/');
  
  try {
    // First, try to load as a folder
    const [allPages, allFolders] = await Promise.all([
      apiClient.getPages(),
      apiClient.getFolderTree()
    ]);
    
    // Check if this path corresponds to a folder
    const findFolderByPath = (folders: any[], targetPath: string): any => {
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
      // This is a folder - filter pages and subfolders for this path
      const folderPages = allPages.filter((page: any) => 
        page.metaData?.path === fullPath || 
        (fullPath === '/' && !page.metaData?.path?.includes('/'))
      );
      
      return {
        isFolder: true,
        path: fullPath,
        folderName: folder.name,
        pages: folderPages,
        folders: allFolders,
        currentFolder: folder
      };
    }
    
    // If not a folder, try to load as a page
    try {
      const page = await apiClient.getPageByPath(fullPath);
      return {
        isFolder: false,
        path: fullPath,
        page: page
      };
    } catch (pageError) {
      // Neither folder nor page found
      throw error(404, {
        message: 'Folder or page not found'
      });
    }
  } catch (err) {
    console.error('Error loading folder/page:', err);
    throw error(500, {
      message: 'Failed to load content'
    });
  }
};