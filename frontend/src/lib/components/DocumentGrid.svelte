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
	import { ToggleSlider } from '$lib/components/ui/toggle-slider/index.js';
	import { FileText, Trash2 } from 'lucide-svelte';
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
		onSelectionChange?: (selectedPaths: string[]) => void;
		multiSelectMode?: boolean;
		onMultiSelectModeChange?: (enabled: boolean) => void;
		showMultiSelectToggle?: boolean;
	}

	let {
		documents,
		loading = false,
		error = null,
		showTags = true,
		showDates = true,
		showPath = true,
		emptyMessage = 'No documents found.',
		className = '',
		onSelectionChange,
		multiSelectMode = false,
		onMultiSelectModeChange,
		showMultiSelectToggle = false
	}: Props = $props();

	let deleteDialogOpen = $state(false);
	let documentToDelete = $state<string | null>(null);
	let bulkDeleteDialogOpen = $state(false);
	let internalMultiSelectMode = $state(multiSelectMode);
	let actualMultiSelectMode = $derived(
		onMultiSelectModeChange ? multiSelectMode : internalMultiSelectMode
	);
	let selectedDocuments = $state<Set<string>>(new Set());
	let isDeletingBulk = $state(false);

	// Notify parent of selection changes
	$effect(() => {
		if (actualMultiSelectMode && onSelectionChange) {
			onSelectionChange([...selectedDocuments]);
		}
	});

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

	function toggleMultiSelectMode(newMode: boolean) {
		if (onMultiSelectModeChange) {
			onMultiSelectModeChange(newMode);
		} else {
			internalMultiSelectMode = newMode;
		}
		if (!newMode) {
			selectedDocuments = new Set();
		}
	}

	function toggleSelection(path: string, event?: Event) {
		if (!actualMultiSelectMode) return;

		event?.stopPropagation();

		const newSelected = new Set(selectedDocuments);
		if (newSelected.has(path)) {
			newSelected.delete(path);
		} else {
			newSelected.add(path);
		}
		selectedDocuments = newSelected;
	}

	function selectAll() {
		if (!actualMultiSelectMode) return;
		selectedDocuments = new Set(documents.map((doc) => doc.metaData.path));
	}

	function clearSelection() {
		selectedDocuments = new Set();
	}

	function handleBulkDelete() {
		if (selectedDocuments.size === 0) return;
		bulkDeleteDialogOpen = true;
	}

	async function confirmBulkDelete() {
		if (selectedDocuments.size === 0) return;

		try {
			isDeletingBulk = true;
			const deletePromises = Array.from(selectedDocuments).map((path) =>
				documentActions.deleteDocument(path)
			);
			await Promise.all(deletePromises);

			selectedDocuments = new Set();
			bulkDeleteDialogOpen = false;
		} catch (err) {
			console.error('Failed to delete documents:', err);
		} finally {
			isDeletingBulk = false;
		}
	}

	function cancelBulkDelete() {
		bulkDeleteDialogOpen = false;
	}
</script>

<div class="space-y-4 {className}">
	<!-- Multi-select Toggle -->
	{#if showMultiSelectToggle && documents.length > 0}
		<div class="flex justify-end">
			<ToggleSlider
				checked={actualMultiSelectMode}
				onCheckedChange={toggleMultiSelectMode}
				size="sm"
			/>
		</div>
	{/if}

	<!-- Selection Toolbar -->
	{#if actualMultiSelectMode && selectedDocuments.size > 0}
		<div class="bg-muted border-border flex items-center justify-between rounded-lg border p-3">
			<div class="flex items-center gap-3">
				<span class="text-muted-foreground text-sm">
					{selectedDocuments.size} document{selectedDocuments.size === 1 ? '' : 's'} selected
				</span>
				<Button variant="ghost" size="sm" onclick={clearSelection}>Clear selection</Button>
			</div>
			<div class="flex items-center gap-2">
				<Button variant="outline" size="sm" onclick={selectAll}>Select all</Button>
				<Button
					variant="destructive"
					size="sm"
					onclick={handleBulkDelete}
					disabled={selectedDocuments.size === 0}
				>
					<Trash2 class="mr-1 h-4 w-4" />
					Delete ({selectedDocuments.size})
				</Button>
			</div>
		</div>
	{/if}

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
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
			{#each documents as document (document.metaData.path + document.metaData.slug)}
				<DocumentCard
					{document}
					{showTags}
					{showDates}
					{showPath}
					enableMultiSelect={actualMultiSelectMode}
					isSelected={selectedDocuments.has(document.metaData.path)}
					onView={() => handleView(document.metaData.path)}
					onEdit={() => handleEdit(document.metaData.path)}
					onDelete={() => handleDelete(document.metaData.path)}
					onToggleSelect={(event) => toggleSelection(document.metaData.path, event)}
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

<!-- Bulk Delete Confirmation Dialog -->
<Dialog bind:open={bulkDeleteDialogOpen}>
	<DialogContent>
		<DialogHeader>
			<DialogTitle>Delete Multiple Documents</DialogTitle>
			<DialogDescription>
				Are you sure you want to delete {selectedDocuments.size} document{selectedDocuments.size ===
				1
					? ''
					: 's'}? This action cannot be undone.
			</DialogDescription>
		</DialogHeader>
		<DialogFooter>
			<Button variant="outline" onclick={cancelBulkDelete} disabled={isDeletingBulk}>Cancel</Button>
			<Button variant="destructive" onclick={confirmBulkDelete} disabled={isDeletingBulk}>
				{isDeletingBulk
					? 'Deleting...'
					: `Delete ${selectedDocuments.size} document${selectedDocuments.size === 1 ? '' : 's'}`}
			</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>
