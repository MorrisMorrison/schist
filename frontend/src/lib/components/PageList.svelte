<script lang="ts">
	import { goto } from '$app/navigation';
	import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
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
		emptyMessage?: string;
		className?: string;
	}

	let {
		pages,
		loading = false,
		error = null,
		showTags = true,
		showDates = true,
		emptyMessage = 'No pages found.',
		className = ''
	}: Props = $props();

	let searchTerm = $state('');
	let deleteDialogOpen = $state(false);
	let pageToDelete = $state<string | null>(null);

	const filteredPages = $derived(
		pages.filter(page =>
			page.metaData.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
			page.metaData.tags?.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase())) ||
			page.content.toLowerCase().includes(searchTerm.toLowerCase())
		)
	);

	function handleView(slug: string) {
		goto(`/${slug}`);
	}

	function handleEdit(slug: string) {
		goto(`/edit/${slug}`);
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
	<!-- Search Input -->
	{#if pages.length > 0}
		<div class="mb-6">
			<Input 
				type="text" 
				placeholder="Search pages..." 
				bind:value={searchTerm}
				class="max-w-md"
			/>
		</div>
	{/if}

	<!-- Error Display -->
	{#if error}
		<ErrorAlert error={error} onDismiss={() => pageActions.clearError()} />
	{/if}

	<!-- Loading Spinner -->
	{#if loading}
		<div class="flex justify-center py-8">
			<LoadingSpinner size="lg" />
		</div>
	{:else if filteredPages.length === 0 && pages.length === 0}
		<!-- Empty State -->
		<div class="flex flex-col items-center justify-center py-12 text-center">
			<FileText class="h-12 w-12 text-muted-foreground mb-4" />
			<h3 class="text-lg font-medium text-foreground mb-2">No pages yet</h3>
			<p class="text-muted-foreground mb-4">{emptyMessage}</p>
			<Button onclick={() => goto('/new')}>
				Create your first page
			</Button>
		</div>
	{:else if filteredPages.length === 0}
		<!-- No Search Results -->
		<div class="flex flex-col items-center justify-center py-8 text-center">
			<FileText class="h-8 w-8 text-muted-foreground mb-4" />
			<p class="text-muted-foreground">No pages match your search for "{searchTerm}"</p>
		</div>
	{:else}
		<!-- Page Grid -->
		<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
			{#each filteredPages as page (page.metaData.slug)}
				<PageCard 
					{page}
					onView={handleView}
					onEdit={handleEdit}
					onDelete={handleDelete}
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
