<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		Dialog,
		DialogContent,
		DialogDescription,
		DialogFooter,
		DialogHeader,
		DialogTitle
	} from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { FileText } from 'lucide-svelte';
	import PageCard from './PageCard.svelte';
	import LoadingSpinner from './LoadingSpinner.svelte';
	import ErrorAlert from './ErrorAlert.svelte';
	import type { Page } from '$lib/api/types.js';
	import { pageActions } from '$lib/stores/pages.js';

	interface Props {
		pages: Page[];
		loading?: boolean;
		error?: string | null;
		showTags?: boolean;
		showDates?: boolean;
		showPath?: boolean;
		emptyMessage?: string;
		className?: string;
	}

	let {
		pages,
		loading = false,
		error = null,
		showTags = true,
		showDates = true,
		showPath = true,
		emptyMessage = 'No pages found.',
		className = ''
	}: Props = $props();

	let deleteDialogOpen = $state(false);
	let pageToDelete = $state<string | null>(null);

	function handleView(path: string) {
		goto(`/pages${path}`);
	}

	function handleEdit(path: string) {
		goto(`/edit${path}`);
	}

	function handleDelete(slug: string) {
		pageToDelete = slug;
		deleteDialogOpen = true;
	}

	async function confirmDelete() {
		if (!pageToDelete) return;

		try {
			await pageActions.deletePage(pageToDelete);
			deleteDialogOpen = false;
			pageToDelete = null;
		} catch (err) {
			console.error('Failed to delete page:', err);
		}
	}

	function cancelDelete() {
		deleteDialogOpen = false;
		pageToDelete = null;
	}
</script>

<div class="space-y-4 {className}">
	<!-- Error Display -->
	{#if error}
		<ErrorAlert {error} onDismiss={() => pageActions.clearError()} />
	{/if}

	<!-- Loading Spinner -->
	{#if loading}
		<div class="flex justify-center py-8">
			<LoadingSpinner size="lg" />
		</div>
	{:else if pages.length === 0}
		<!-- Empty State -->
		<div class="flex flex-col items-center justify-center py-12 text-center">
			<FileText class="text-muted-foreground mb-4 h-12 w-12" />
			<h3 class="text-foreground mb-2 text-lg font-medium">No pages yet</h3>
			<p class="text-muted-foreground mb-4">{emptyMessage}</p>
			<Button onclick={() => goto('/new')}>Create your first page</Button>
		</div>
	{:else}
		<!-- Page Grid -->
		<div
			class="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4 sm:grid-cols-1 md:grid-cols-[repeat(auto-fill,minmax(320px,1fr))]"
		>
			{#each pages as page (page.metaData.path + page.metaData.slug)}
				<PageCard
					{page}
					{showTags}
					{showDates}
					{showPath}
					onView={() => handleView(page.metaData.path)}
					onEdit={() => handleEdit(page.metaData.path)}
					onDelete={() => handleDelete(page.metaData.path)}
				/>
			{/each}
		</div>
	{/if}
</div>

<!-- Delete Confirmation Dialog -->
<Dialog bind:open={deleteDialogOpen}>
	<DialogContent>
		<DialogHeader>
			<DialogTitle>Delete Page</DialogTitle>
			<DialogDescription>
				Are you sure you want to delete this page? This action cannot be undone.
			</DialogDescription>
		</DialogHeader>
		<DialogFooter>
			<Button variant="outline" onclick={cancelDelete}>Cancel</Button>
			<Button variant="destructive" onclick={confirmDelete}>Delete</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>
