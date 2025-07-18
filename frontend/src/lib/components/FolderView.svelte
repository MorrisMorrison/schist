<script lang="ts">
  import { onMount } from 'svelte';
  import { pagesStore, foldersStore } from '$lib/stores/pages';
  import { getParentPath } from '$lib/api/types';
  import PageCard from './PageCard.svelte';
  import Breadcrumbs from './Breadcrumbs.svelte';
  import CreateFolderModal from './CreateFolderModal.svelte';
  import { Plus, FolderPlus, File, Folder } from 'lucide-svelte';
  import type { Page, Folder as FolderType } from '$lib/api/types';

  interface Props {
    path?: string;
    showCreateButtons?: boolean;
  }
  
  let { path = '', showCreateButtons = true }: Props = $props();

  let showCreateFolderModal = $state(false);
  let showCreatePageModal = $state(false);
  let newPageTitle = $state('');

  // Get current folder and its contents
  const currentFolder = $derived($foldersStore.folders.find(f => f.path === path));
  const currentFolderPages = $derived($pagesStore.pages.filter(page => 
    page.metadata.path === path || 
    (path === '' && !page.metadata.path?.includes('/'))
  ));
  const subFolders = $derived(currentFolder?.sub_folders || []);

  // Load folder contents on mount and path changes
  onMount(() => {
    if (path) {
      pagesStore.setCurrentFolder(path);
    }
    foldersStore.loadFolderTree();
  });

  $effect(() => {
    if (path) {
      pagesStore.setCurrentFolder(path);
    }
  });

  // Navigate to subfolder
  function navigateToFolder(folderPath: string) {
    window.location.href = `/pages${folderPath}`;
  }

  // Navigate to page
  function navigateToPage(page: Page) {
    const pagePath = page.metadata.path || `/${page.metadata.slug}`;
    window.location.href = `/pages${pagePath}`;
  }

  // Create new page in current folder
  async function createPage() {
    if (!newPageTitle.trim()) return;
    
    const slug = newPageTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const pagePath = path ? `${path}/${slug}` : `/${slug}`;
    
    const newPage: Page = {
      metadata: {
        title: newPageTitle,
        slug: slug,
        path: pagePath,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        tags: []
      },
      content: `# ${newPageTitle}\n\nStart writing your content here...`
    };

    try {
      await pagesStore.createPage(newPage);
      newPageTitle = '';
      showCreatePageModal = false;
      // Navigate to the new page
      navigateToPage(newPage);
    } catch (error) {
      console.error('Failed to create page:', error);
    }
  }

  // Handle folder creation
  function handleFolderCreated() {
    showCreateFolderModal = false;
    foldersStore.loadFolderTree();
  }
</script>

<div class="folder-view">
  <!-- Breadcrumbs -->
  <Breadcrumbs {path} />

  <!-- Folder Header -->
  <div class="folder-header">
    <h1 class="folder-title">
      {#if path === ''}
        All Documentation
      {:else}
        {path.split('/').pop()?.charAt(0).toUpperCase() + path.split('/').pop()?.slice(1).replace(/-/g, ' ') || 'Folder'}
      {/if}
    </h1>
    
    {#if showCreateButtons}
      <div class="folder-actions">
        <button 
          type="button"
          class="btn btn-secondary"
          on:click={() => showCreateFolderModal = true}
        >
          <FolderPlus class="icon" />
          New Folder
        </button>
        <button 
          type="button"
          class="btn btn-primary"
          on:click={() => showCreatePageModal = true}
        >
          <Plus class="icon" />
          New Page
        </button>
      </div>
    {/if}
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
              on:click={() => navigateToFolder(folder.path)}
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
        <File class="empty-icon" />
        <h3>No content yet</h3>
        <p>This folder is empty. Create your first page or subfolder to get started.</p>
        {#if showCreateButtons}
          <div class="empty-actions">
            <button 
              type="button"
              class="btn btn-primary"
              on:click={() => showCreatePageModal = true}
            >
              <Plus class="icon" />
              Create Page
            </button>
            <button 
              type="button"
              class="btn btn-secondary"
              on:click={() => showCreateFolderModal = true}
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
  <div class="modal-overlay" on:click={() => showCreatePageModal = false}>
    <div class="modal" on:click|stopPropagation>
      <div class="modal-header">
        <h3>Create New Page</h3>
        <button 
          type="button"
          class="modal-close"
          on:click={() => showCreatePageModal = false}
        >
          ×
        </button>
      </div>
      <form on:submit|preventDefault={createPage}>
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
          <button type="button" class="btn btn-secondary" on:click={() => showCreatePageModal = false}>
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
    align-items: center;
    margin-bottom: 2rem;
    padding-bottom: 1rem;
    border-bottom: 2px solid var(--color-border);
  }

  .folder-title {
    font-size: 2rem;
    font-weight: 600;
    color: var(--color-text);
    margin: 0;
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

  .folder-icon {
    width: 2rem;
    height: 2rem;
    color: var(--color-primary);
    flex-shrink: 0;
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

  .empty-icon {
    width: 4rem;
    height: 4rem;
    margin: 0 auto 1rem;
    color: var(--color-text-tertiary);
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
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    border: 1px solid var(--color-border);
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    text-decoration: none;
    background: var(--color-background);
    color: var(--color-text);
  }

  .btn-primary {
    background: var(--color-primary);
    color: white;
    border-color: var(--color-primary);
  }

  .btn-secondary {
    background: var(--color-background-secondary);
    border-color: var(--color-border);
  }

  .btn:hover {
    opacity: 0.9;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .icon {
    width: 1rem;
    height: 1rem;
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