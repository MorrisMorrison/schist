<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount, onDestroy } from 'svelte';
	import Editor from '$lib/components/editor/Editor.svelte';
	import DeleteConfirmModal from '$lib/components/modal/DeleteConfirmModal.svelte';
	import UnsavedChangesModal from '$lib/components/modal/UnsavedChangesModal.svelte';
	import { useUnsavedChangesGuard } from '$lib/composables/useUnsavedChangesGuard.svelte.js';
	import { Button } from '$lib/components/ui/button';
	import { documentActions } from '$lib/stores/documents.js';
	import { generateSlug } from '$lib/utils/path';
	import { Check, Trash2, RotateCcw, CircleX } from 'lucide-svelte';
	import type { PageData } from './$types';
	import MarkdownInfoHelp from '$lib/components/editor/MarkdownInfoHelp.svelte';
	import { extractTitleFromContent, extractHashtagsFromContent } from '$lib/utils/content-parser';

	let { data }: { data: PageData } = $props();

	// Handle null page during SSR
	const document = data.document || {
		metaData: { title: '', tags: [], slug: '', path: '', created: '', updated: '' },
		content: ''
	};

	let content = $state(document.content);
	let isSaving = $state(false);
	let saveError = $state('');
	let isDeleting = $state(false);
	let showDeleteModal = $state(false);

	let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

	let originalContent = document.content;

	const titleFromContent = $derived(extractTitleFromContent(content));
	const isDirty = $derived(content !== originalContent);

	// Navigation guard for unsaved changes
	const navigationGuard = useUnsavedChangesGuard({
		isDirty: () => isDirty,
		onSave: handleSave,
		onShowModal: () => {
			// Modal state is managed by the guard
		},
		onHideModal: () => {
			// Modal state is managed by the guard
		}
	});

	function replaceLastPathSegment(path: string, newSegment: string): string {
		const parts = path.split('/').filter(Boolean);
		if (parts.length === 0) return newSegment;
		parts[parts.length - 1] = newSegment;
		return parts.join('/');
	}
	async function handleSave() {
		if (!content.trim()) {
			saveError = 'Content is required';
			return;
		}

		isSaving = true;
		saveError = '';

		const title = titleFromContent;
		const tags = extractHashtagsFromContent(content);
		const slug = generateSlug(title);
		const newPath = replaceLastPathSegment(data.path, slug);
		try {
			await documentActions.updateDocumentByPath(
				data.path,
				{
					...document,
					metaData: {
						...document.metaData,
						slug: slug,
						path: newPath,
						title: title.trim(),
						tags: tags
					},
					content: content.trim()
				},
				'manual'
			);

			// Update originalContent to mark as saved
			originalContent = content;

			await goto(`/documents/${newPath}`);
		} catch (error) {
			console.error('Failed to save document:', error);
			saveError = error instanceof Error ? error.message : 'Failed to save document';
		} finally {
			isSaving = false;
		}
	}

	function handleDeleteClick() {
		showDeleteModal = true;
	}

	async function handleDeleteConfirm() {
		isDeleting = true;

		try {
			await documentActions.deleteDocumentByPath(data.path);
			showDeleteModal = false;
			goto('/');
		} catch (error) {
			console.error('Failed to delete document:', error);
			saveError = error instanceof Error ? error.message : 'Failed to delete document';
		} finally {
			isDeleting = false;
		}
	}

	function handleDeleteCancel() {
		showDeleteModal = false;
		isDeleting = false;
	}

	function handleContentChange(newContent: string) {
		content = newContent;
		scheduleAutoSave();
	}

	function scheduleAutoSave() {
		if (autoSaveTimer) {
			clearTimeout(autoSaveTimer);
		}

		const hasChanges = content !== originalContent;

		if (hasChanges) {
			autoSaveTimer = setTimeout(async () => {
				await handleSaveWithoutNavigation();
			}, 10000); // 10 second auto-save interval
		}
	}

	async function handleSaveFromEditor(newContent: string) {
		content = newContent;
		await handleSaveWithoutNavigation();
	}

	async function handleSaveWithoutNavigation() {
		if (!content.trim()) {
			saveError = 'Content is required';
			return;
		}

		isSaving = true;
		saveError = '';

		const title = titleFromContent;
		const tags = extractHashtagsFromContent(content);
		const slug = generateSlug(title);
		const newPath = replaceLastPathSegment(data.path, slug);
		try {
			await documentActions.updateDocumentByPath(
				data.path,
				{
					...document,
					metaData: {
						...document.metaData,
						slug: slug,
						path: newPath,
						title: title.trim(),
						tags: tags
					},
					content: content.trim()
				},
				'auto'
			);

			// Update originalContent to mark as saved
			originalContent = content;
		} catch (error) {
			console.error('Failed to auto-save page:', error);
			saveError = error instanceof Error ? error.message : 'Failed to auto-save page';
		} finally {
			isSaving = false;
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && showDeleteModal) {
			showDeleteModal = false;
		}
		if (event.key === 'Escape' && navigationGuard.showModal) {
			navigationGuard.handleCancel();
		}
	}

	// Set up browser protection for page close/reload
	onMount(() => {
		navigationGuard.setupBrowserProtection();
	});

	onDestroy(() => {
		navigationGuard.cleanupBrowserProtection();
	});
</script>

<svelte:head>
	<title>Edit {document.metaData.title} - Schist Wiki</title>
	<meta name="description" content="Edit document: {document.metaData.title}" />
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="mx-auto max-w-7xl space-y-8 p-6">
	<!-- Header -->
	<div class="border-primary border-b pb-6">
		<div class="flex items-center justify-between">
			<div>
				<h1 class="text-primary text-2xl font-bold">{titleFromContent}</h1>
				<p class="text-secondary mt-1 text-sm">
					Editing <span class="font-mono">/{data.path}</span>
				</p>
			</div>

			<div class="flex items-center gap-3">
				<Button variant="outline" href="/documents/{data.path}" data-testid="cancel-button">
					Cancel
				</Button>

				<Button
					variant="destructive"
					data-testid="delete-document-button"
					onclick={handleDeleteClick}
					disabled={isDeleting}
				>
					<Trash2 class="h-4 w-4" />
					Delete
				</Button>

				<Button
					variant="default"
					data-testid="save-document-button"
					onclick={handleSave}
					disabled={isSaving || !content.trim()}
				>
					{#if isSaving}
						<RotateCcw class="h-4 w-4 animate-spin" />
						Saving...
					{:else}
						<Check class=" h-4 w-4" />
						Save Document
					{/if}
				</Button>
			</div>
		</div>
	</div>

	<!-- Error Message -->
	{#if saveError}
		<div class="bg-red-muted rounded-md p-4">
			<div class="flex">
				<div class="flex-shrink-0">
					<CircleX class="text-red-primary h-5 w-5"></CircleX>
				</div>
				<div class="ml-3">
					<h3 class="text-red-primary text-sm font-medium">Error</h3>
					<div class="text-red-secondary mt-2 text-sm">
						<p>{saveError}</p>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Content Editor -->
	<div class="bg-content ring-border-primary rounded-lg p-6 shadow-sm ring-1">
		<Editor
			initialContent={content}
			onContentChange={handleContentChange}
			onSave={handleSaveFromEditor}
			autoSave={{
				enabled: false
			}}
		/>
	</div>

	<MarkdownInfoHelp />
</div>

<!-- Delete Confirmation Modal -->
<DeleteConfirmModal
	open={showDeleteModal}
	{isDeleting}
	onConfirm={handleDeleteConfirm}
	onCancel={handleDeleteCancel}
/>

<!-- Unsaved Changes Modal -->
<UnsavedChangesModal
	open={navigationGuard.showModal}
	documentTitle={titleFromContent}
	onSave={navigationGuard.handleSave}
	onDiscard={navigationGuard.handleDiscard}
	onCancel={navigationGuard.handleCancel}
	isSaving={navigationGuard.isSaving}
/>
