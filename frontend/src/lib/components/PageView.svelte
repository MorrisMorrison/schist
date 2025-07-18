<script lang="ts">
  import { Edit, Trash2, Move, Calendar, Tag, User } from 'lucide-svelte';
  import Breadcrumbs from './Breadcrumbs.svelte';
  import type { Page } from '$lib/api/types';

  interface Props {
    page: Page;
    onEdit?: (slug: string) => void;
    onDelete?: (slug: string) => void;
    onView?: (slug: string) => void;
    onMove?: (page: Page) => void;
  }
  
  let { page, onEdit = () => {}, onDelete = () => {}, onView = () => {}, onMove = () => {} }: Props = $props();

  const pagePath = $derived(page.metadata?.path || `/${page.metadata?.slug}`);
  const pageTitle = $derived(page.metadata?.title || page.metaData?.title || 'Untitled');
  const pageSlug = $derived(page.metadata?.slug || page.metaData?.slug || '');
  const pageCreated = $derived(page.metadata?.created || page.metaData?.created);
  const pageUpdated = $derived(page.metadata?.updated || page.metaData?.updated);
  const pageTags = $derived(page.metadata?.tags || page.metaData?.tags || []);

  function formatDate(dateString?: string): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  function renderMarkdown(content: string): string {
    // Basic markdown rendering - in a real app, you'd use a proper markdown parser
    return content
      .replace(/^### (.*$)/gm, '<h3>$1</h3>')
      .replace(/^## (.*$)/gm, '<h2>$1</h2>')
      .replace(/^# (.*$)/gm, '<h1>$1</h1>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>');
  }
</script>

<svelte:head>
  <title>{pageTitle}</title>
  <meta name="description" content={page.content?.slice(0, 160) || ''} />
</svelte:head>

<article class="page-view">
  <!-- Breadcrumbs -->
  <Breadcrumbs path={pagePath} currentPageTitle={pageTitle} />

  <!-- Page Header -->
  <header class="page-header">
    <div class="page-title-section">
      <h1 class="page-title">{pageTitle}</h1>
      
      <!-- Page Metadata -->
      <div class="page-metadata">
        {#if pageCreated}
          <div class="metadata-item">
            <Calendar class="metadata-icon" />
            <span>Created {formatDate(pageCreated)}</span>
          </div>
        {/if}
        
        {#if pageUpdated && pageUpdated !== pageCreated}
          <div class="metadata-item">
            <Calendar class="metadata-icon" />
            <span>Updated {formatDate(pageUpdated)}</span>
          </div>
        {/if}
        
        {#if pageTags.length > 0}
          <div class="metadata-item">
            <Tag class="metadata-icon" />
            <div class="tags">
              {#each pageTags as tag}
                <span class="tag">{tag}</span>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </div>

    <!-- Action Buttons -->
    <div class="page-actions">
      <button 
        type="button"
        class="btn btn-secondary"
        on:click={() => onEdit(pageSlug)}
        title="Edit page"
      >
        <Edit class="btn-icon" />
        Edit
      </button>
      
      <button 
        type="button"
        class="btn btn-secondary"
        on:click={() => onMove(page)}
        title="Move page"
      >
        <Move class="btn-icon" />
        Move
      </button>
      
      <button 
        type="button"
        class="btn btn-danger"
        on:click={() => onDelete(pageSlug)}
        title="Delete page"
      >
        <Trash2 class="btn-icon" />
        Delete
      </button>
    </div>
  </header>

  <!-- Page Content -->
  <main class="page-content">
    {#if page.content}
      <div class="content-wrapper">
        {@html renderMarkdown(page.content)}
      </div>
    {:else}
      <div class="empty-content">
        <p>This page has no content yet.</p>
        <button 
          type="button"
          class="btn btn-primary"
          on:click={() => onEdit(pageSlug)}
        >
          Add Content
        </button>
      </div>
    {/if}
  </main>
</article>

<style>
  .page-view {
    max-width: 1200px;
    margin: 0 auto;
    padding: 1rem;
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 2rem;
    padding-bottom: 1rem;
    border-bottom: 2px solid var(--color-border);
  }

  .page-title-section {
    flex: 1;
  }

  .page-title {
    font-size: 2.5rem;
    font-weight: 700;
    color: var(--color-text);
    margin: 0 0 1rem 0;
    line-height: 1.2;
  }

  .page-metadata {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .metadata-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: var(--color-text-secondary);
  }

  .metadata-icon {
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
  }

  .tags {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .tag {
    background: var(--color-primary);
    color: white;
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .page-actions {
    display: flex;
    gap: 0.5rem;
    margin-left: 1rem;
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

  .btn-secondary {
    background: var(--color-background-secondary);
    border-color: var(--color-border);
  }

  .btn-secondary:hover {
    background: var(--color-background-tertiary);
    border-color: var(--color-primary);
  }

  .btn-primary {
    background: var(--color-primary);
    color: white;
    border-color: var(--color-primary);
  }

  .btn-primary:hover {
    background: var(--color-primary-hover);
    border-color: var(--color-primary-hover);
  }

  .btn-danger {
    background: var(--color-error);
    color: white;
    border-color: var(--color-error);
  }

  .btn-danger:hover {
    background: var(--color-error-hover);
    border-color: var(--color-error-hover);
  }

  .btn-icon {
    width: 1rem;
    height: 1rem;
  }

  .page-content {
    background: var(--color-background);
    border-radius: 0.5rem;
    padding: 2rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .content-wrapper {
    line-height: 1.6;
    color: var(--color-text);
  }

  .content-wrapper :global(h1) {
    font-size: 2rem;
    font-weight: 600;
    margin: 2rem 0 1rem 0;
    color: var(--color-text);
  }

  .content-wrapper :global(h2) {
    font-size: 1.5rem;
    font-weight: 600;
    margin: 1.5rem 0 1rem 0;
    color: var(--color-text);
  }

  .content-wrapper :global(h3) {
    font-size: 1.25rem;
    font-weight: 600;
    margin: 1.25rem 0 0.75rem 0;
    color: var(--color-text);
  }

  .content-wrapper :global(p) {
    margin: 1rem 0;
    color: var(--color-text);
  }

  .content-wrapper :global(code) {
    background: var(--color-background-secondary);
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    font-size: 0.875rem;
  }

  .content-wrapper :global(a) {
    color: var(--color-primary);
    text-decoration: none;
  }

  .content-wrapper :global(a:hover) {
    text-decoration: underline;
  }

  .content-wrapper :global(strong) {
    font-weight: 600;
  }

  .content-wrapper :global(em) {
    font-style: italic;
  }

  .empty-content {
    text-align: center;
    padding: 3rem;
    color: var(--color-text-secondary);
  }

  .empty-content p {
    margin-bottom: 1.5rem;
    font-size: 1.125rem;
  }

  @media (max-width: 768px) {
    .page-view {
      padding: 0.5rem;
    }

    .page-header {
      flex-direction: column;
      gap: 1rem;
      align-items: flex-start;
    }

    .page-actions {
      margin-left: 0;
      width: 100%;
      justify-content: flex-start;
    }

    .page-title {
      font-size: 2rem;
    }

    .page-content {
      padding: 1rem;
    }

    .page-metadata {
      flex-direction: column;
      gap: 0.5rem;
    }
  }
</style>