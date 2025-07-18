<script lang="ts">
  import { goto } from '$app/navigation';
  import { pagesStore, foldersStore, folderActions, pageActions } from '$lib/stores/pages';
  import PageCard from './PageCard.svelte';
  import Breadcrumbs from './Breadcrumbs.svelte';
  import CreateFolderModal from './CreateFolderModal.svelte';
  import { Plus, FolderPlus, File, Folder } from 'lucide-svelte';
  import type { Page, Folder as FolderType } from '$lib/api/types';

  interface Props {
    path?: string;
    showCreateButtons?: boolean;
    initialPages?: Page[];
    initialFolders?: FolderType[];
  }
  
  let { path = '', showCreateButtons = true, initialPages = [], initialFolders = [] }: Props = $props();

  let showCreateFolderModal = $state(false);
  let showCreatePageModal = $state(false);
  let newPageTitle = $state('');
  let isLoadingFolderData = $state(false);
  let sortBy = $state('name'); // 'name', 'created', 'modified'
  let sortOrder = $state('asc'); // 'asc', 'desc'

  // Get current folder and its contents
  const currentFolderData = $derived($foldersStore.folders?.find(f => f.path === path));
  const currentFolderPages = $derived($pagesStore.pages.filter(page => {
    const pagePath = page.metaData?.path || '';
    
    // Handle root folder case
    if (path === '' || path === '/') {
      // Pages in root folder don't have '/' after the first character
      return pagePath.split('/').length === 2; // ['', 'filename']
    }
    
    // For specific folders, check if page is directly in this folder
    // e.g., for folder '/anotherfolder', match pages like '/anotherfolder/page'
    // but not '/anotherfolder/subfolder/page'
    const folderSegments = path.split('/').filter(Boolean);
    const pageSegments = pagePath.split('/').filter(Boolean);
    
    // Page must be exactly one level deeper than the folder
    return pageSegments.length === folderSegments.length + 1 &&
           pageSegments.slice(0, folderSegments.length).join('/') === folderSegments.join('/');
  }).sort((a, b) => {
    let result = 0;
    
    if (sortBy === 'name') {
      result = (a.metaData.title || '').localeCompare(b.metaData.title || '');
    } else if (sortBy === 'created') {
      const dateA = new Date(a.metaData.created || '').getTime();
      const dateB = new Date(b.metaData.created || '').getTime();
      result = dateB - dateA; // Newest first by default
    } else if (sortBy === 'modified') {
      const dateA = new Date(a.metaData.updated || a.metaData.created || '').getTime();
      const dateB = new Date(b.metaData.updated || b.metaData.created || '').getTime();
      result = dateB - dateA; // Newest first by default
    }
    
    return sortOrder === 'desc' ? -result : result;
  }));
  
  const subFolders = $derived((currentFolderData?.sub_folders || []).sort((a, b) => {
    const result = a.name.localeCompare(b.name);
    return sortOrder === 'desc' ? -result : result;
  }));

  // Load folder contents on mount and path changes
  $effect(() => {
    // Initialize stores with initial data if provided
    if (initialPages.length > 0) {
      pagesStore.update(state => ({ ...state, pages: initialPages }));
    }
    if (initialFolders.length > 0) {
      foldersStore.update(state => ({ ...state, folders: initialFolders }));
    }
    
    // Load fresh data if not provided
    if (initialPages.length === 0 || initialFolders.length === 0) {
      loadFolderData();
    }
  });

  async function loadFolderData() {
    try {
      isLoadingFolderData = true;
      await Promise.all([
        folderActions.loadFolderTree(),
        pageActions.loadPages()
      ]);
    } catch (error) {
      console.error('Failed to load folder data:', error);
    } finally {
      isLoadingFolderData = false;
    }
  }

  // Navigate to subfolder
  function navigateToFolder(folderPath: string) {
    goto(`/folders${folderPath}`);
  }


  // Create new page in current folder
  async function createPage() {
    if (!newPageTitle.trim()) return;
    
    const slug = newPageTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const pagePath = path ? `${path}/${slug}` : `/${slug}`;
    
    try {
      await pageActions.createPage({
        metaData: {
          title: newPageTitle,
          path: pagePath,
          tags: []
        },
        content: `# ${newPageTitle}\n\nStart writing your content here...`
      });
      newPageTitle = '';
      showCreatePageModal = false;
      // Navigate to the new page
      goto(`/pages${pagePath}`);
    } catch (error) {
      console.error('Failed to create page:', error);
    }
  }

  // Handle folder creation
  async function handleFolderCreated() {
    showCreateFolderModal = false;
    await loadFolderData();
  }
</script>

<div class="folder-view">
  <!-- Breadcrumbs -->
  <Breadcrumbs {path} />

  <!-- Folder Header -->
  <div class="folder-header">
    <div class="folder-title-section">
      <h1 class="folder-title">
        {#if path === ''}
          All Documentation
        {:else}
          {(() => {
            const folderName = path.split('/').pop();
            if (!folderName) return 'Folder';
            return folderName.charAt(0).toUpperCase() + folderName.slice(1).replace(/-/g, ' ');
          })()}
        {/if}
      </h1>
      
      <!-- Folder Statistics -->
      <div class="folder-stats">
        <span class="stat-item">
          {subFolders.length} {subFolders.length === 1 ? 'folder' : 'folders'}
        </span>
        <span class="stat-divider">•</span>
        <span class="stat-item">
          {currentFolderPages.length} {currentFolderPages.length === 1 ? 'page' : 'pages'}
        </span>
      </div>
      
      {#if isLoadingFolderData}
        <div class="loading-indicator">
          <div class="spinner"></div>
          <span>Loading...</span>
        </div>
      {/if}
    </div>
    
    <div class="folder-controls">
      <!-- Sort Controls -->
      <div class="sort-controls">
        <label class="sort-label" for="sort-select">Sort by:</label>
        <select bind:value={sortBy} class="sort-select" id="sort-select">
          <option value="name">Name</option>
          <option value="created">Created</option>
          <option value="modified">Modified</option>
        </select>
        <button 
          type="button"
          class="sort-order-btn"
          onclick={() => sortOrder = sortOrder === 'asc' ? 'desc' : 'asc'}
          title={sortOrder === 'asc' ? 'Sort descending' : 'Sort ascending'}
        >
          {sortOrder === 'asc' ? '↑' : '↓'}
        </button>
      </div>
      
      {#if showCreateButtons}
        <div class="folder-actions">
          <button 
            type="button"
            class="btn btn-secondary"
            onclick={() => showCreateFolderModal = true}
          >
            <FolderPlus class="icon" />
            New Folder
          </button>
          <button 
            type="button"
            class="btn btn-primary"
            onclick={() => showCreatePageModal = true}
          >
            <Plus class="icon" />
            New Page
          </button>
        </div>
      {/if}
    </div>
  </div>

  <!-- Folder Contents -->
  <div class="folder-contents">
    <!-- Subfolders -->
    {#if subFolders.length > 0}
      <section class="folders-section">
        <h2 class="section-title">Folders</h2>
        <div class="folders-grid">
          {#each subFolders as folder}
            <button 
              type="button"
              class="folder-card"
              onclick={() => navigateToFolder(folder.path)}
            >
              <Folder class="folder-icon" />
              <div class="folder-info">
                <h3 class="folder-name">{folder.name}</h3>
                <p class="folder-meta">
                  {folder.page_count} {folder.page_count === 1 ? 'page' : 'pages'}
                </p>
              </div>
            </button>
          {/each}
        </div>
      </section>
    {/if}

    <!-- Pages -->
    {#if currentFolderPages.length > 0}
      <section class="pages-section">
        <h2 class="section-title">Pages</h2>
        <div class="pages-grid">
          {#each currentFolderPages as page}
            <PageCard {page} showPath={false} />
          {/each}
        </div>
      </section>
    {/if}

    <!-- Empty State -->
    {#if subFolders.length === 0 && currentFolderPages.length === 0}
      <div class="empty-state">
        <div class="empty-icon-container">
          <File class="empty-icon" />
        </div>
        <h3>
          {#if path === ''}
            Welcome to your documentation
          {:else}
            This folder is empty
          {/if}
        </h3>
        <p>
          {#if path === ''}
            Start organizing your knowledge by creating your first page or folder.
          {:else}
            Add some content to this folder to get started.
          {/if}
        </p>
        {#if showCreateButtons}
          <div class="empty-actions">
            <button 
              type="button"
              class="btn btn-primary"
              onclick={() => showCreatePageModal = true}
            >
              <Plus class="icon" />
              Create Page
            </button>
            <button 
              type="button"
              class="btn btn-secondary"
              onclick={() => showCreateFolderModal = true}
            >
              <FolderPlus class="icon" />
              Create Folder
            </button>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<!-- Create Folder Modal -->
{#if showCreateFolderModal}
  <CreateFolderModal 
    parentPath={path}
    onClose={() => showCreateFolderModal = false}
    onCreated={handleFolderCreated}
  />
{/if}

<!-- Create Page Modal -->
{#if showCreatePageModal}
  <div class="modal-overlay" role="dialog" aria-modal="true" tabindex="-1" onclick={() => showCreatePageModal = false} onkeydown={(e) => { if (e.key === 'Escape') showCreatePageModal = false; }}>
    <div class="modal" role="dialog" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <h3>Create New Page</h3>
        <button 
          type="button"
          class="modal-close"
          onclick={() => showCreatePageModal = false}
        >
          ×
        </button>
      </div>
      <form onsubmit={(e) => { e.preventDefault(); createPage(); }}>
        <div class="form-group">
          <label for="page-title">Page Title</label>
          <input 
            id="page-title"
            type="text"
            bind:value={newPageTitle}
            placeholder="Enter page title"
            required
          />
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick={() => showCreatePageModal = false}>
            Cancel
          </button>
          <button type="submit" class="btn btn-primary" disabled={!newPageTitle.trim()}>
            Create Page
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

<style>
  .folder-view {
    max-width: 1200px;
    margin: 0 auto;
    padding: 1rem;
  }

  .folder-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 2rem;
    padding-bottom: 1rem;
    border-bottom: 2px solid var(--color-border);
    gap: 1rem;
  }

  .folder-title-section {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .folder-title {
    font-size: 2rem;
    font-weight: 600;
    color: var(--color-text);
    margin: 0;
  }

  .folder-stats {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: var(--color-text-secondary);
  }

  .stat-item {
    font-weight: 500;
  }

  .stat-divider {
    color: var(--color-text-tertiary);
  }

  .loading-indicator {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--color-text-secondary);
    font-size: 0.875rem;
  }

  .spinner {
    width: 1rem;
    height: 1rem;
    border: 2px solid var(--color-border);
    border-top: 2px solid var(--color-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .folder-controls {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .sort-controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    background: var(--color-background-secondary);
    border-radius: 0.375rem;
    border: 1px solid var(--color-border);
  }

  .sort-label {
    font-size: 0.875rem;
    color: var(--color-text-secondary);
    font-weight: 500;
  }

  .sort-select {
    background: var(--color-background);
    border: 1px solid var(--color-border);
    border-radius: 0.25rem;
    padding: 0.25rem 0.5rem;
    font-size: 0.875rem;
    color: var(--color-text);
    cursor: pointer;
  }

  .sort-order-btn {
    background: var(--color-background);
    border: 1px solid var(--color-border);
    border-radius: 0.25rem;
    padding: 0.25rem 0.5rem;
    font-size: 0.875rem;
    color: var(--color-text);
    cursor: pointer;
    transition: all 0.2s ease;
    min-width: 2rem;
  }

  .sort-order-btn:hover {
    background: var(--color-background-tertiary);
  }

  .folder-actions {
    display: flex;
    gap: 0.5rem;
  }

  .section-title {
    font-size: 1.25rem;
    font-weight: 500;
    color: var(--color-text);
    margin-bottom: 1rem;
  }

  .folders-section {
    margin-bottom: 2rem;
  }

  .folders-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1rem;
    margin-bottom: 2rem;
  }

  .folder-card {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: var(--color-background-secondary);
    border: 1px solid var(--color-border);
    border-radius: 0.5rem;
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
  }

  .folder-card:hover {
    border-color: var(--color-primary);
    background: var(--color-background-tertiary);
  }


  .folder-info {
    flex: 1;
  }

  .folder-name {
    font-size: 1rem;
    font-weight: 500;
    color: var(--color-text);
    margin: 0 0 0.25rem 0;
  }

  .folder-meta {
    font-size: 0.875rem;
    color: var(--color-text-secondary);
    margin: 0;
  }

  .pages-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 1rem;
  }

  .empty-state {
    text-align: center;
    padding: 3rem 1rem;
    color: var(--color-text-secondary);
  }

  .empty-icon-container {
    display: flex;
    justify-content: center;
    margin-bottom: 1rem;
  }


  .empty-state h3 {
    font-size: 1.5rem;
    margin-bottom: 0.5rem;
    color: var(--color-text);
  }

  .empty-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: center;
    margin-top: 1.5rem;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    text-decoration: none;
    border: none;
    outline: none;
  }

  .btn-primary {
    background: var(--blue-primary);
    color: white;
  }

  .btn-primary:hover {
    background: var(--blue-secondary);
  }

  .btn-primary:focus {
    background: var(--blue-secondary);
    box-shadow: 0 0 0 2px var(--blue-primary);
  }

  .btn-secondary {
    background: var(--bg-secondary);
    color: var(--text-primary);
  }

  .btn-secondary:hover {
    background: var(--gray-hover);
  }

  .btn-secondary:focus {
    background: var(--gray-active);
    box-shadow: 0 0 0 2px var(--gray-active);
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }


  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal {
    background: var(--color-background);
    border: 1px solid var(--color-border);
    border-radius: 0.5rem;
    max-width: 500px;
    width: 90%;
    max-height: 90vh;
    overflow-y: auto;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    border-bottom: 1px solid var(--color-border);
  }

  .modal-header h3 {
    margin: 0;
    font-size: 1.25rem;
  }

  .modal-close {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: var(--color-text-secondary);
  }

  .form-group {
    padding: 1rem;
  }

  .form-group label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 500;
    color: var(--color-text);
  }

  .form-group input {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid var(--color-border);
    border-radius: 0.375rem;
    font-size: 1rem;
    background: var(--color-background);
    color: var(--color-text);
  }

  .form-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    padding: 1rem;
    border-top: 1px solid var(--color-border);
  }

  @media (max-width: 768px) {
    .folder-header {
      flex-direction: column;
      gap: 1rem;
      align-items: flex-start;
    }

    .folder-title-section {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
    }

    .folder-controls {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
      width: 100%;
    }

    .sort-controls {
      flex-wrap: wrap;
      gap: 0.25rem;
    }

    .folder-actions {
      width: 100%;
      justify-content: flex-start;
    }

    .folders-grid,
    .pages-grid {
      grid-template-columns: 1fr;
    }
  }
</style>