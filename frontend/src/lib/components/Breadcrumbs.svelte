<script lang="ts">
  import { getParentPath } from '$lib/api/types';
  import { ChevronRight, Home } from 'lucide-svelte';

  export let path: string = '';
  export let currentPageTitle: string = '';

  // Build breadcrumb segments from path
  $: segments = path
    .split('/')
    .filter(segment => segment !== '')
    .map((segment, index, array) => {
      const fullPath = '/' + array.slice(0, index + 1).join('/');
      return {
        name: segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' '),
        path: fullPath,
        isLast: index === array.length - 1
      };
    });

  // Handle navigation to folder/path
  function navigateToPath(targetPath: string) {
    if (targetPath === '/') {
      window.location.href = '/pages';
    } else {
      window.location.href = `/pages${targetPath}`;
    }
  }
</script>

<nav class="breadcrumbs" aria-label="Breadcrumb navigation">
  <ol class="breadcrumb-list">
    <!-- Home/Root -->
    <li class="breadcrumb-item">
      <button 
        type="button"
        class="breadcrumb-link"
        on:click={() => navigateToPath('/')}
        aria-label="Go to home"
      >
        <Home class="breadcrumb-icon" />
        <span>Home</span>
      </button>
    </li>

    <!-- Path segments -->
    {#each segments as segment}
      <li class="breadcrumb-item">
        <ChevronRight class="breadcrumb-separator" />
        {#if segment.isLast}
          <span class="breadcrumb-current" aria-current="page">
            {segment.name}
          </span>
        {:else}
          <button 
            type="button"
            class="breadcrumb-link"
            on:click={() => navigateToPath(segment.path)}
            aria-label="Go to {segment.name}"
          >
            {segment.name}
          </button>
        {/if}
      </li>
    {/each}

    <!-- Current page title if different from path -->
    {#if currentPageTitle && currentPageTitle !== segments[segments.length - 1]?.name}
      <li class="breadcrumb-item">
        <ChevronRight class="breadcrumb-separator" />
        <span class="breadcrumb-current" aria-current="page">
          {currentPageTitle}
        </span>
      </li>
    {/if}
  </ol>
</nav>

<style>
  .breadcrumbs {
    margin-bottom: 1rem;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--color-border);
  }

  .breadcrumb-list {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .breadcrumb-item {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .breadcrumb-link {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    background: none;
    border: none;
    border-radius: 0.25rem;
    color: var(--color-text-secondary);
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s ease;
    text-decoration: none;
  }

  .breadcrumb-link:hover {
    color: var(--color-primary);
    background-color: var(--color-background-secondary);
  }

  .breadcrumb-link:focus {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }

  .breadcrumb-current {
    padding: 0.25rem 0.5rem;
    color: var(--color-text);
    font-size: 0.875rem;
    font-weight: 500;
  }

  .breadcrumb-separator {
    width: 1rem;
    height: 1rem;
    color: var(--color-text-tertiary);
    flex-shrink: 0;
  }

  .breadcrumb-icon {
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
  }

  /* Responsive design */
  @media (max-width: 768px) {
    .breadcrumbs {
      padding: 0.25rem 0;
    }
    
    .breadcrumb-link,
    .breadcrumb-current {
      padding: 0.125rem 0.25rem;
      font-size: 0.8125rem;
    }
    
    .breadcrumb-separator,
    .breadcrumb-icon {
      width: 0.875rem;
      height: 0.875rem;
    }
  }
</style>