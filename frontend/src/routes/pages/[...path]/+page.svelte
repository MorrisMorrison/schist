<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { pageActions } from '$lib/stores/pages';
	import { goto } from '$app/navigation';
	import FolderView from '$lib/components/FolderView.svelte';
	import PageView from '$lib/components/PageView.svelte';
	import MovePageModal from '$lib/components/MovePageModal.svelte';
	import type { Page } from '$lib/api/types';

	let currentPage = $state<Page | null>(null);
	let isFolder = $state(false);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let showMoveModal = $state(false);
	let pageToMove = $state<Page | null>(null);

	const path = $derived(page.params.path || '');
	const decodedPath = $derived(decodeURIComponent(path));
	const fullPath = $derived(`/${decodedPath}`);

	onMount(() => {
		loadContent();
	});

	// Watch for path changes
	$effect(() => {
		if (path !== undefined) {
			loadContent();
		}
	});

	async function loadContent() {
		isLoading = true;
		error = null;
		currentPage = null;
		isFolder = false;

		try {
			// First try to load as a page
			try {
				currentPage = await pageActions.loadPageByPath(fullPath);
				isFolder = false;
			} catch (pageError) {
				// If page not found, treat as folder
				isFolder = true;
				currentPage = null;
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load content';
		} finally {
			isLoading = false;
		}
	}

	function handleEditPage(slug: string) {
		goto(`/edit/${path}`);
	}

	function handleDeletePage(path: string) {
		if (confirm('Are you sure you want to delete this page?')) {
			pageActions.deletePage(path);
		}
	}

	function handleViewPage(slug: string) {
		// Already viewing the page, could scroll to top or refresh
		window.scrollTo(0, 0);
	}

	function handleMovePage(page: Page) {
		pageToMove = page;
		showMoveModal = true;
	}

	function handlePageMoved() {
		showMoveModal = false;
		pageToMove = null;
		// Refresh the current view
		loadContent();
	}
</script>

<svelte:head>
	<title
		>{currentPage?.metaData?.title ||
			(isFolder ? (path ? path.split('/').pop() + ' - Folder' : 'Pages') : 'Pages')}</title
	>
</svelte:head>

<div class="pages-container">
	{#if isLoading}
		<div class="loading-state">
			<div class="loading-spinner"></div>
			<p>Loading...</p>
		</div>
	{:else if error}
		<div class="error-state">
			<h1>Error</h1>
			<p>{error}</p>
			<button class="retry-button" onclick={loadContent}> Try Again </button>
		</div>
	{:else if isFolder}
		<FolderView path={fullPath} />
	{:else if currentPage}
		<PageView
			page={currentPage}
			onEdit={handleEditPage}
			onDelete={handleDeletePage}
			onView={handleViewPage}
			onMove={handleMovePage}
		/>
	{:else}
		<div class="not-found-state">
			<h1>Content Not Found</h1>
			<p>The page or folder at <code>{fullPath}</code> could not be found.</p>
			<div class="not-found-actions">
				<button class="btn btn-primary" onclick={() => goto('/pages')}> Go to Pages Home </button>
				<button class="btn btn-secondary" onclick={() => goto('/')}> Go to Home </button>
			</div>
		</div>
	{/if}
</div>

<!-- Move Page Modal -->
{#if showMoveModal && pageToMove}
	<MovePageModal
		page={pageToMove}
		onClose={() => {
			showMoveModal = false;
			pageToMove = null;
		}}
		onMoved={handlePageMoved}
	/>
{/if}

<style>
	.pages-container {
		min-height: 100vh;
		/* background: var(--color-background); */
	}

	.loading-state,
	.error-state,
	.not-found-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 60vh;
		padding: 2rem;
		text-align: center;
	}

	.loading-spinner {
		width: 2rem;
		height: 2rem;
		border: 2px solid var(--color-border);
		border-top: 2px solid var(--color-primary);
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin-bottom: 1rem;
	}

	.error-state h1,
	.not-found-state h1 {
		font-size: 2rem;
		color: var(--color-text);
		margin-bottom: 1rem;
	}

	.error-state p,
	.not-found-state p {
		color: var(--color-text-secondary);
		margin-bottom: 2rem;
		max-width: 600px;
	}

	.not-found-state code {
		background: var(--color-background-secondary);
		padding: 0.25rem 0.5rem;
		border-radius: 0.25rem;
		font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
	}

	.not-found-actions {
		display: flex;
		gap: 1rem;
		justify-content: center;
		flex-wrap: wrap;
	}

	.btn {
		padding: 0.75rem 1.5rem;
		border: 1px solid var(--color-border);
		border-radius: 0.5rem;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
		text-decoration: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
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

	.btn-secondary {
		background: var(--color-background);
		color: var(--color-text);
		border-color: var(--color-border);
	}

	.btn-secondary:hover {
		background: var(--color-background-secondary);
	}

	.retry-button {
		background: var(--color-primary);
		color: white;
		border: 1px solid var(--color-primary);
		padding: 0.75rem 1.5rem;
		border-radius: 0.5rem;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.retry-button:hover {
		background: var(--color-primary-hover);
		border-color: var(--color-primary-hover);
	}

	@keyframes spin {
		0% {
			transform: rotate(0deg);
		}
		100% {
			transform: rotate(360deg);
		}
	}

	@media (max-width: 768px) {
		.not-found-actions {
			flex-direction: column;
			width: 100%;
			max-width: 300px;
		}
	}
</style>
