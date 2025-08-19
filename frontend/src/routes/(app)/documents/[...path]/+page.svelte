<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/state';
	import { documentActions } from '$lib/stores/documents.svelte';
	import { goto } from '$app/navigation';
	import FolderView from '$lib/components/folder/FolderView.svelte';
	import DocumentView from '$lib/components/document/DocumentView.svelte';
	import type { Document } from '$lib/api/types';
	import { Button } from '$lib/components/ui/button';
	import { Home, Plus, RotateCcw, Search } from '@lucide/svelte';
	import { addToRecentDocuments } from '$lib/utils/fuzzy-search';
	import { isNotFoundError } from '$lib/utils/error';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import { useOptimizedLoading } from '$lib/composables/useOptimizedLoading.svelte.js';

	let currentDocument = $state<Document | null>(null);
	let isFolder = $state(false);
	let error = $state<string | null>(null);
	let isNotFound = $state(false);
	let isLoadingContent = $state(false);

	const documentLoader = useOptimizedLoading(200, 150);

	const path = $derived(page.params.path || '');
	const decodedPath = $derived(decodeURIComponent(path));
	const fullPath = $derived(`/${decodedPath}`);

	onMount(() => {
		loadContent();
	});

	onDestroy(() => {
		documentLoader.cleanup();
	});

	$effect(() => {
		if (path !== undefined) {
			loadContent();
		}
	});

	async function loadContent() {
		documentLoader.startLoading();
		isLoadingContent = true;
		error = null;
		currentDocument = null;
		isFolder = false;
		isNotFound = false;

		try {
			try {
				currentDocument = await documentActions.loadDocumentByPath(fullPath);
				isFolder = false;
				isNotFound = false;

				if (currentDocument) {
					addToRecentDocuments(currentDocument.metaData.path);
				}
			} catch (documentError) {
				if (isNotFoundError(documentError)) {
					isNotFound = true;
					isFolder = false;
				} else {
					isFolder = true;
					isNotFound = false;
				}
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load content';
		} finally {
			isLoadingContent = false;
			documentLoader.stopLoading();
		}
	}

	function handleEditDocument() {
		goto(`/edit/${path}`);
	}

	async function handleDeleteDocument(path: string) {
		try {
			await documentActions.deleteDocument(path);
			goto('/');
		} catch (err) {
			console.error('Failed to delete document:', err);
		}
	}
</script>

<svelte:head>
	<title
		>{currentDocument?.metaData?.title ||
			(isFolder ? (path ? path.split('/').pop() + ' - Folder' : 'Documents') : 'Documents')}</title
	>
</svelte:head>

<div class="min-h-screen">
	{#if documentLoader.loading}
		<div class="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center">
			<div class="mb-4">
				<LoadingSpinner size="lg" />
			</div>
			<p class="text-muted-foreground">Loading...</p>
		</div>
	{:else if error}
		<div class="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center">
			<h1 class="text-foreground mb-4 text-2xl font-semibold">Error</h1>
			<p class="text-muted-foreground mb-8 max-w-2xl">{error}</p>
			<Button onclick={loadContent}>Try Again</Button>
		</div>
	{:else if isFolder}
		<FolderView path={fullPath} />
	{:else if currentDocument}
		<DocumentView
			document={currentDocument}
			onEdit={handleEditDocument}
			onDelete={handleDeleteDocument}
		/>
	{:else if isNotFound}
		<div class="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center">
			<div class="mb-6 text-6xl">🔍</div>
			<h1 class="text-foreground mb-4 text-3xl font-bold" data-testid="not-found-heading">
				Document Not Found
			</h1>
			<p class="text-muted-foreground mb-2 text-lg" data-testid="not-found-message">
				404 - The document you're looking for doesn't exist.
			</p>
			<p class="text-muted-foreground mb-8 max-w-2xl">
				The document at <code
					class="bg-muted text-muted-foreground rounded px-2 py-1 font-mono text-sm"
					>{fullPath}</code
				> could not be found. It may have been moved, deleted, or never existed.
			</p>
			<div class="flex flex-wrap justify-center gap-4 md:flex-row">
				<Button
					size="lg"
					onclick={() =>
						goto('/new?title=' + encodeURIComponent(fullPath.split('/').pop() || 'New Document'))}
				>
					<Plus class="h-5 w-5 text-white"></Plus>
					Create this Document</Button
				>
				<Button variant="secondary" size="lg" onclick={() => goto('/documents')}>
					<Search class="h-5 w-5 text-white"></Search>
					Browse All Documents</Button
				>
				<Button variant="outline" size="lg" onclick={() => goto('/')}>
					<Home class="h-5 w-5 text-white"></Home>
					Go to Home</Button
				>
			</div>
		</div>
	{:else if !isLoadingContent}
		<div class="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center">
			<h1 class="text-foreground mb-4 text-2xl font-semibold">Something Went Wrong</h1>
			<p class="text-muted-foreground mb-8 max-w-2xl">
				We encountered an unexpected error while loading this content.
			</p>
			<div class="flex flex-wrap justify-center gap-4 md:flex-row">
				<Button onclick={loadContent}>
					<RotateCcw class="h-5 w-5 text-white"></RotateCcw>
					Try Again</Button
				>
				<Button variant="outline" size="lg" onclick={() => goto('/')}>
					<Home class="h-5 w-5 text-white"></Home>
					Go to Home</Button
				>
			</div>
		</div>
	{/if}
</div>
