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
	import DocumentCard from './DocumentCard.svelte';
	import LoadingSpinner from './LoadingSpinner.svelte';
	import ErrorAlert from './ErrorAlert.svelte';
	import type { Document } from '$lib/api/types.js';
	import { documentActions } from '$lib/stores/documents.js';

	interface Props {
		documents: Document[];
		loading?: boolean;
		error?: string | null;
		showTags?: boolean;
		showDates?: boolean;
		showPath?: boolean;
		emptyMessage?: string;
		className?: string;
	}

	let {
		documents,
		loading = false,
		error = null,
		showTags = true,
		showDates = true,
		showPath = true,
		emptyMessage = 'No documents found.',
		className = ''
	}: Props = $props();

	let deleteDialogOpen = $state(false);
	let documentToDelete = $state<string | null>(null);

	function handleView(path: string) {
		goto(`/documents${path}`);
	}

	function handleEdit(path: string) {
		goto(`/edit${path}`);
	}

	function handleDelete(slug: string) {
		documentToDelete = slug;
		deleteDialogOpen = true;
	}

	async function confirmDelete() {
		if (!documentToDelete) return;

		try {
			await documentActions.deleteDocument(documentToDelete);
			deleteDialogOpen = false;
			documentToDelete = null;
		} catch (err) {
			console.error('Failed to delete document:', err);
		}
	}

	function cancelDelete() {
		deleteDialogOpen = false;
		documentToDelete = null;
	}
</script>

<div class="space-y-4 {className}">
	<!-- Error Display -->
	{#if error}
		<ErrorAlert {error} onDismiss={() => documentActions.clearError()} />
	{/if}

	<!-- Loading Spinner -->
	{#if loading}
		<div class="flex justify-center py-8">
			<LoadingSpinner size="lg" />
		</div>
	{:else if documents.length === 0}
		<!-- Empty State -->
		<div class="flex flex-col items-center justify-center py-12 text-center">
			<FileText class="text-muted-foreground mb-4 h-12 w-12" />
			<h3 class="text-foreground mb-2 text-lg font-medium">No documents yet</h3>
			<p class="text-muted-foreground mb-4">{emptyMessage}</p>
			<Button onclick={() => goto('/new')}>Create your first document</Button>
		</div>
	{:else}
		<!-- Document Grid -->
		<div
			class="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4 sm:grid-cols-1 md:grid-cols-[repeat(auto-fill,minmax(320px,1fr))]"
		>
			{#each documents as document (document.metaData.path + document.metaData.slug)}
				<DocumentCard
					{document}
					{showTags}
					{showDates}
					{showPath}
					onView={() => handleView(document.metaData.path)}
					onEdit={() => handleEdit(document.metaData.path)}
					onDelete={() => handleDelete(document.metaData.path)}
				/>
			{/each}
		</div>
	{/if}
</div>

<!-- Delete Confirmation Dialog -->
<Dialog bind:open={deleteDialogOpen}>
	<DialogContent>
		<DialogHeader>
			<DialogTitle>Delete Document</DialogTitle>
			<DialogDescription>
				Are you sure you want to delete this document? This action cannot be undone.
			</DialogDescription>
		</DialogHeader>
		<DialogFooter>
			<Button variant="outline" onclick={cancelDelete}>Cancel</Button>
			<Button variant="destructive" onclick={confirmDelete}>Delete</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>
