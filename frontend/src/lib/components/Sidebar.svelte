<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { foldersStore, folderActions, pagesStore, pageActions } from '$lib/stores/pages';
  import { page } from '$app/stores';
  import { Folder, FolderOpen, File, ChevronRight, Plus, Search } from 'lucide-svelte';
  import CreateFolderModal from './CreateFolderModal.svelte';
  import type { Folder as FolderType } from '$lib/api/types';

  let searchQuery = $state('');
  let expandedFolders = $state(new Set<string>());
  let showCreateFolderModal = $state(false);
  let parentPathForModal = $state('');

  const currentPath = $derived($page.url.pathname);
  const folders = $derived($foldersStore.folders || []);
  const isLoading = $derived($foldersStore.loading);
  const pages = $derived($pagesStore.pages || []);

  // Filter folders based on search
  const filteredFolders = $derived(searchQuery.trim() 
    ? filterFolders(folders || [], searchQuery.toLowerCase())
    : folders || []);

  onMount(() => {
    folderActions.loadFolderTree();
    pageActions.loadPages();
    
    // Restore expanded folders from localStorage
    if (typeof window !== 'undefined') {
      const savedExpanded = localStorage.getItem('sidebar-expanded-folders');
      if (savedExpanded) {
        try {
          expandedFolders = new Set(JSON.parse(savedExpanded));
        } catch (e) {
          console.warn('Failed to parse saved expanded folders:', e);
        }
      }
    }
    
    // Auto-expand folders containing the current path
    if (currentPath.startsWith('/folders/')) {
      const pathSegments = currentPath.replace('/folders/', '').split('/');
      let buildPath = '';
      for (const segment of pathSegments) {
        if (segment) {
          buildPath += `/${segment}`;
          expandedFolders.add(buildPath);
        }
      }
      expandedFolders = new Set(expandedFolders);
    }
  });

  function filterFolders(folders: FolderType[], query: string): FolderType[] {
    return folders.filter(folder => {
      const matchesName = folder.name.toLowerCase().includes(query);
      const hasMatchingSubfolder = folder.sub_folders?.some(sub => 
        filterFolders([sub], query).length > 0
      );
      return matchesName || hasMatchingSubfolder;
    }).map(folder => ({
      ...folder,
      sub_folders: folder.sub_folders ? filterFolders(folder.sub_folders, query) : []
    }));
  }

  function toggleFolder(folderPath: string) {
    if (expandedFolders.has(folderPath)) {
      expandedFolders.delete(folderPath);
    } else {
      expandedFolders.add(folderPath);
    }
    expandedFolders = new Set(expandedFolders);
    
    // Save to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('sidebar-expanded-folders', JSON.stringify([...expandedFolders]));
    }
  }


  function isCurrentPath(path: string): boolean {
    return currentPath === `/folders${path}` || currentPath === `/folders${path}/`;
  }

  // Get pages for a specific folder path
  function getPagesForFolder(folderPath: string) {
    return pages.filter(page => {
      const pagePath = page.metaData?.path || '';
      
      // Handle root folder case
      if (folderPath === '' || folderPath === '/') {
        // Pages in root folder don't have '/' after the first character
        return pagePath.split('/').length === 2; // ['', 'filename']
      }
      
      // For specific folders, check if page is directly in this folder
      // e.g., for folder '/anotherfolder', match pages like '/anotherfolder/page'
      // but not '/anotherfolder/subfolder/page'
      const folderSegments = folderPath.split('/').filter(Boolean);
      const pageSegments = pagePath.split('/').filter(Boolean);
      
      // Page must be exactly one level deeper than the folder
      return pageSegments.length === folderSegments.length + 1 &&
             pageSegments.slice(0, folderSegments.length).join('/') === folderSegments.join('/');
    });
  }


  function createFolder(parentPath: string) {
    parentPathForModal = parentPath;
    showCreateFolderModal = true;
  }

  function handleFolderCreated() {
    showCreateFolderModal = false;
    parentPathForModal = '';
    folderActions.loadFolderTree();
  }

  // Expand all folders
  function expandAll() {
    const getAllFolderPaths = (folders: FolderType[]): string[] => {
      let paths: string[] = [];
      for (const folder of folders) {
        paths.push(folder.path);
        if (folder.sub_folders) {
          paths = paths.concat(getAllFolderPaths(folder.sub_folders));
        }
      }
      return paths;
    };
    
    const allPaths = getAllFolderPaths(folders);
    expandedFolders = new Set(allPaths);
    
    // Save to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('sidebar-expanded-folders', JSON.stringify([...expandedFolders]));
    }
  }

  // Collapse all folders
  function collapseAll() {
    expandedFolders = new Set();
    
    // Save to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('sidebar-expanded-folders', JSON.stringify([]));
    }
  }

  function renderFolderTree(folders: FolderType[], depth: number = 0) {
    return folders.map(folder => ({
      folder,
      isExpanded: expandedFolders.has(folder.path),
      isCurrent: isCurrentPath(folder.path),
      depth,
      hasSubFolders: folder.sub_folders && folder.sub_folders.length > 0,
      pages: getPagesForFolder(folder.path)
    }));
  }
</script>

<aside class="sidebar">
  <div class="sidebar-header">
    <h2 class="sidebar-title">Pages</h2>
    <div class="header-actions">
      <button 
        type="button"
        class="action-btn"
        onclick={expandAll}
        title="Expand all folders"
      >
        <FolderOpen class="icon" />
      </button>
      <button 
        type="button"
        class="action-btn"
        onclick={collapseAll}
        title="Collapse all folders"
      >
        <Folder class="icon" />
      </button>
      <button 
        type="button"
        class="action-btn"
        onclick={() => createFolder('')}
        title="Create new folder"
      >
        <Plus class="icon" />
      </button>
    </div>
  </div>

  <!-- Search -->
  <div class="search-container">
    <div class="search-wrapper">
      <Search class="search-icon" />
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Search folders..."
        class="search-input"
      />
    </div>
  </div>

  <!-- Folder Tree -->
  <div class="folder-tree">
    {#if isLoading}
      <div class="loading">Loading folders...</div>
    {:else if filteredFolders.length === 0}
      <div class="empty-state">
        {#if searchQuery.trim()}
          <p>No folders match your search.</p>
        {:else}
          <p>No folders yet.</p>
          <button 
            type="button"
            class="create-first-folder-btn"
            onclick={() => createFolder('')}
          >
            Create your first folder
          </button>
        {/if}
      </div>
    {:else}
      <!-- Root link -->
      <div class="folder-item root-item">
        <a 
          href="/folders"
          class="folder-link {currentPath === '/folders' ? 'current' : ''}"
        >
          <FolderOpen class="folder-icon" />
          <span class="folder-name">All Folders</span>
        </a>
      </div>

      <!-- Folder tree -->
      {#each renderFolderTree(filteredFolders) as item}
        <div class="folder-item" style="margin-left: {item.depth * 1.5}rem;">
          <div class="folder-row">
            <!-- Expand/collapse button -->
            {#if item.hasSubFolders}
              <button 
                type="button"
                class="expand-btn"
                onclick={() => toggleFolder(item.folder.path)}
              >
                <ChevronRight class="expand-icon {item.isExpanded ? 'expanded' : ''}" />
              </button>
            {:else}
              <div class="expand-spacer"></div>
            {/if}

            <!-- Folder link -->
            <a 
              href="/folders{item.folder.path}"
              class="folder-link {item.isCurrent ? 'current' : ''}"
            >
              <Folder class="folder-icon" />
              <span class="folder-name">{item.folder.name}</span>
              <span class="page-count">({item.folder.page_count})</span>
            </a>

            <!-- Create subfolder button -->
            <button 
              type="button"
              class="create-subfolder-btn"
              onclick={() => createFolder(item.folder.path)}
              title="Create subfolder"
            >
              <Plus class="icon" />
            </button>
          </div>

          <!-- Render subfolders and files when expanded -->
          {#if item.isExpanded}
            <!-- Render files in current folder first -->
            {#if item.pages.length > 0}
              {#each item.pages as page}
                <div class="file-item" style="margin-left: {(item.depth + 1) * 1.5}rem;">
                  <div class="file-row">
                    <div class="expand-spacer"></div>
                    <a 
                      href="/pages{page.metaData?.path || `/${page.metaData?.slug}`}"
                      class="file-link"
                    >
                      <File class="file-icon" />
                      <span class="file-name">{page.metaData?.title || 'Untitled'}</span>
                    </a>
                  </div>
                </div>
              {/each}
            {/if}

            <!-- Then render subfolders -->
            {#if item.hasSubFolders}
              {#each renderFolderTree(item.folder.sub_folders, item.depth + 1) as subItem}
                <div class="folder-item" style="margin-left: {subItem.depth * 1.5}rem;">
                  <div class="folder-row">
                    {#if subItem.hasSubFolders}
                      <button 
                        type="button"
                        class="expand-btn"
                        onclick={() => toggleFolder(subItem.folder.path)}
                      >
                        <ChevronRight class="expand-icon {subItem.isExpanded ? 'expanded' : ''}" />
                      </button>
                    {:else}
                      <div class="expand-spacer"></div>
                    {/if}

                    <a 
                      href="/folders{subItem.folder.path}"
                      class="folder-link {subItem.isCurrent ? 'current' : ''}"
                    >
                      <Folder class="folder-icon" />
                      <span class="folder-name">{subItem.folder.name}</span>
                      <span class="page-count">({subItem.folder.page_count})</span>
                    </a>

                    <button 
                      type="button"
                      class="create-subfolder-btn"
                      onclick={() => createFolder(subItem.folder.path)}
                      title="Create subfolder"
                    >
                      <Plus class="icon" />
                    </button>
                  </div>

                  <!-- Render files in expanded subfolder -->
                  {#if subItem.isExpanded && subItem.pages.length > 0}
                    {#each subItem.pages as page}
                      <div class="file-item" style="margin-left: {(subItem.depth + 1) * 1.5}rem;">
                        <div class="file-row">
                          <div class="expand-spacer"></div>
                          <a 
                            href="/pages{page.metaData?.path || `/${page.metaData?.slug}`}"
                            class="file-link"
                          >
                            <File class="file-icon" />
                            <span class="file-name">{page.metaData?.title || 'Untitled'}</span>
                          </a>
                        </div>
                      </div>
                    {/each}
                  {/if}
                </div>
              {/each}
            {/if}
          {/if}
        </div>
      {/each}
    {/if}
  </div>
</aside>

<!-- Create Folder Modal -->
{#if showCreateFolderModal}
  <CreateFolderModal 
    parentPath={parentPathForModal}
    onClose={() => { showCreateFolderModal = false; parentPathForModal = ''; }}
    onCreated={handleFolderCreated}
  />
{/if}

<style>
  .sidebar {
    width: 280px;
    height: 100vh;
    background: var(--color-background);
    border-right: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .sidebar-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    border-bottom: 1px solid var(--color-border);
  }

  .sidebar-title {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    background: none;
    border: none;
    border-radius: 0.25rem;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .action-btn:hover {
    background: var(--bg-secondary);
    color: var(--text-primary);
  }

  .search-container {
    padding: 0.75rem;
    border-bottom: 1px solid var(--color-border);
  }

  .search-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .search-icon {
    position: absolute;
    left: 0.75rem;
    width: 1rem;
    height: 1rem;
    color: var(--color-text-secondary);
    pointer-events: none;
  }

  .search-input {
    width: 100%;
    padding: 0.5rem 0.75rem 0.5rem 2.25rem;
    border: 1px solid var(--color-border);
    border-radius: 0.375rem;
    font-size: 0.875rem;
    background: var(--color-background);
    color: var(--color-text);
  }

  .search-input:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px rgba(var(--color-primary-rgb), 0.1);
  }

  .folder-tree {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem 0;
  }

  .loading {
    padding: 1rem;
    text-align: center;
    color: var(--color-text-secondary);
    font-size: 0.875rem;
  }

  .empty-state {
    padding: 1rem;
    text-align: center;
    color: var(--color-text-secondary);
    font-size: 0.875rem;
  }

  .create-first-folder-btn {
    margin-top: 0.75rem;
    padding: 0.5rem 1rem;
    background: var(--color-primary);
    color: white;
    border: none;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .create-first-folder-btn:hover {
    background: var(--color-primary-hover);
  }

  .folder-item {
    position: relative;
  }

  .root-item {
    padding: 0.25rem 0.5rem;
    border-bottom: 1px solid var(--color-border);
    margin-bottom: 0.5rem;
  }

  .folder-row {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.125rem 0.5rem;
    border-radius: 0.25rem;
    transition: background 0.2s ease;
  }

  .folder-row:hover {
    background: var(--color-background-secondary);
  }

  .expand-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    height: 1.25rem;
    background: none;
    border: none;
    border-radius: 0.25rem;
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .expand-btn:hover {
    background: var(--color-background-tertiary);
  }

  .expand-spacer {
    width: 1.25rem;
    height: 1.25rem;
  }

  .expand-icon {
    width: 0.875rem;
    height: 0.875rem;
    transition: transform 0.2s ease;
  }

  .expand-icon.expanded {
    transform: rotate(90deg);
  }

  .folder-link {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
    padding: 0.25rem;
    border-radius: 0.25rem;
    color: var(--color-text);
    text-decoration: none;
    font-size: 0.875rem;
    transition: all 0.2s ease;
  }

  .folder-link:hover {
    background: var(--color-background-secondary);
  }

  .folder-link.current {
    background: var(--color-primary);
    color: white;
  }

  .folder-icon {
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
  }

  .folder-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .page-count {
    font-size: 0.75rem;
    color: var(--color-text-tertiary);
    margin-left: auto;
  }

  .folder-link.current .page-count {
    color: rgba(255, 255, 255, 0.8);
  }

  .create-subfolder-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    height: 1.25rem;
    background: none;
    border: none;
    border-radius: 0.25rem;
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
    opacity: 0;
  }

  .folder-row:hover .create-subfolder-btn {
    opacity: 1;
  }

  .create-subfolder-btn:hover {
    background: var(--color-background-tertiary);
    color: var(--color-text);
  }

  .icon {
    width: 0.875rem;
    height: 0.875rem;
  }

  /* File item styling */
  .file-item {
    position: relative;
  }

  .file-row {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.125rem 0.5rem;
    border-radius: 0.25rem;
    transition: background 0.2s ease;
  }

  .file-row:hover {
    background: var(--color-background-secondary);
  }

  .file-link {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
    padding: 0.125rem;
    border-radius: 0.25rem;
    color: var(--color-text-secondary);
    text-decoration: none;
    font-size: 0.8rem;
    transition: all 0.2s ease;
  }

  .file-link:hover {
    color: var(--color-text);
    background: var(--color-background-tertiary);
  }

  .file-icon {
    width: 0.875rem;
    height: 0.875rem;
    flex-shrink: 0;
    color: var(--color-text-tertiary);
  }

  .file-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Scrollbar styling */
  .folder-tree::-webkit-scrollbar {
    width: 6px;
  }

  .folder-tree::-webkit-scrollbar-track {
    background: var(--color-background);
  }

  .folder-tree::-webkit-scrollbar-thumb {
    background: var(--color-border);
    border-radius: 3px;
  }

  .folder-tree::-webkit-scrollbar-thumb:hover {
    background: var(--color-text-secondary);
  }

  @media (max-width: 768px) {
    .sidebar {
      width: 100%;
      height: auto;
      max-height: 40vh;
      position: sticky;
      top: 0;
      z-index: 10;
    }

    .folder-tree {
      max-height: 30vh;
    }
  }
</style>