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
	let isNotFound = $state(false);
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
		isNotFound = false;

		try {
			// First try to load as a page
			try {
				currentPage = await pageActions.loadPageByPath(fullPath);
				isFolder = false;
				isNotFound = false;
			} catch (pageError) {
				// Check if it's a 404 error
				if (pageError instanceof Error && pageError.message.includes('404')) {
					isNotFound = true;
					isFolder = false;
				} else {
					// If not 404, treat as folder
					isFolder = true;
					isNotFound = false;
				}
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load content';
		} finally {
			isLoading = false;
		}
	}

	function handleEditPage() {
		goto(`/edit/${path}`);
	}

	async function handleDeletePage(path: string) {
		try {
			await pageActions.deletePage(path);
			// Navigate to home page after deletion
			goto('/');
		} catch (err) {
			console.error('Failed to delete page:', err);
			// Could show error toast here
		}
	}

	function handleViewPage() {
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

<div class="min-h-screen">
	{#if isLoading}
		<div class="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center">
			<div
				class="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600"
			></div>
			<p class="text-muted-foreground">Loading...</p>
		</div>
	{:else if error}
		<div class="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center">
			<h1 class="text-foreground mb-4 text-2xl font-semibold">Error</h1>
			<p class="text-muted-foreground mb-8 max-w-2xl">{error}</p>
			<button
				class="rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
				onclick={loadContent}
			>
				Try Again
			</button>
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
	{:else if isNotFound}
		<div class="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center">
			<div class="mb-6 text-6xl">🔍</div>
			<h1 class="text-foreground mb-4 text-3xl font-bold">Page Not Found</h1>
			<p class="text-muted-foreground mb-2 text-lg">
				404 - The page you're looking for doesn't exist.
			</p>
			<p class="text-muted-foreground mb-8 max-w-2xl">
				The page at <code class="bg-muted text-muted-foreground rounded px-2 py-1 font-mono text-sm"
					>{fullPath}</code
				> could not be found. It may have been moved, deleted, or never existed.
			</p>
			<div class="flex flex-wrap justify-center gap-4 md:flex-row">
				<button
					class="rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
					onclick={() =>
						goto('/new?title=' + encodeURIComponent(fullPath.split('/').pop() || 'New Page'))}
				>
					Create This Page
				</button>
				<button
					class="rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
					onclick={() => goto('/pages')}
				>
					Browse All Pages
				</button>
				<button
					class="border-border text-foreground hover:bg-muted rounded-lg border px-6 py-3 text-sm font-medium transition-colors focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
					onclick={() => goto('/')}
				>
					Go to Home
				</button>
			</div>
		</div>
	{:else}
		<div class="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center">
			<h1 class="text-foreground mb-4 text-2xl font-semibold">Something Went Wrong</h1>
			<p class="text-muted-foreground mb-8 max-w-2xl">
				We encountered an unexpected error while loading this content.
			</p>
			<div class="flex flex-wrap justify-center gap-4 md:flex-row">
				<button
					class="rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
					onclick={loadContent}
				>
					Try Again
				</button>
				<button
					class="border-border text-foreground hover:bg-muted rounded-lg border px-6 py-3 text-sm font-medium transition-colors focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
					onclick={() => goto('/')}
				>
					Go to Home
				</button>
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
