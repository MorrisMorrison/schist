<script lang="ts">
	import { goto, replaceState } from '$app/navigation';
	import { onMount, onDestroy, untrack } from 'svelte';
	import LazyEditor from '$lib/components/editor/LazyEditor.svelte';
	import DeleteConfirmModal from '$lib/components/modal/DeleteConfirmModal.svelte';
	import UnsavedChangesModal from '$lib/components/modal/UnsavedChangesModal.svelte';
	import { useUnsavedChangesGuard } from '$lib/composables/useUnsavedChangesGuard.svelte.js';
	import { Button } from '$lib/components/ui/button';
	import { documentActions } from '$lib/stores/documents.svelte';
	import { generateSlug } from '$lib/utils/path';
	import { Check, Trash2, RotateCcw, Ellipsis } from '@lucide/svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import type { Document } from '$lib/api/types';
	import MarkdownInfoHelp from '$lib/components/editor/MarkdownInfoHelp.svelte';
	import { extractTitleFromContent, extractHashtagsFromContent } from '$lib/utils/content-parser';
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import { useDocumentExistence } from '$lib/composables/useDocumentExistence.svelte';
	import { getErrorMessage } from '$lib/utils/error';

	// The edit page renders this inside {#key path}, so one instance edits exactly one
	// document and reading the props once at init is intentional.
	let { document: initialDocument, path }: { document: Document | null; path: string } = $props();

	// Handle null page during SSR
	const document = untrack(
		() =>
			initialDocument || {
				metaData: { title: '', tags: [], slug: '', path: '', created: '', updated: '' },
				content: ''
			}
	);

	// Where the document lives now. A save that changes the title renames it, and every
	// later save (auto-save included) must target the new location.
	let currentPath = $state(untrack(() => path));
	let content = $state(document.content);
	let originalContent = $state(document.content);
	let isSaving = $state(false);
	let saveError = $state('');
	let isDeleting = $state(false);
	let showDeleteModal = $state(false);
	let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

	const documentExistence = useDocumentExistence();

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

	$effect(() => {
		const title = titleFromContent;
		const path = currentPath;
		if (title.trim()) {
			const slug = generateSlug(title);
			const newPath = replaceLastPathSegment(path, slug);
			documentExistence.checkExistence(newPath, path);
		} else {
			documentExistence.reset();
		}

		return () => {
			documentExistence.cleanup();
		};
	});

	function replaceLastPathSegment(path: string, newSegment: string): string {
		const parts = path.split('/').filter(Boolean);
		if (parts.length === 0) return newSegment;
		parts[parts.length - 1] = newSegment;
		return parts.join('/');
	}

	function buildUpdate(newPath: string, slug: string) {
		return {
			...document,
			metaData: {
				...document.metaData,
				slug: slug,
				path: newPath,
				title: titleFromContent.trim(),
				tags: extractHashtagsFromContent(content)
			},
			content: content.trim()
		};
	}

	// Record a successful save: the content is clean again and, after a rename, the
	// document (and the edit URL) now live at the saved path.
	function markSaved(savedContent: string, savedPath: string) {
		originalContent = savedContent;
		if (savedPath !== currentPath) {
			currentPath = savedPath;
			replaceState(`/edit/${savedPath}`, {});
		}
	}

	async function handleSave() {
		if (!content.trim()) {
			saveError = 'Content is required';
			return;
		}

		isSaving = true;
		saveError = '';

		const slug = generateSlug(titleFromContent);
		const newPath = replaceLastPathSegment(currentPath, slug);

		if (newPath !== currentPath) {
			const exists = await documentActions.checkDocumentExists(newPath);
			if (exists) {
				saveError = `A document already exists at "${newPath}". Please choose a different title.`;
				isSaving = false;
				return;
			}
		}

		clearAutoSave();

		try {
			const savedContent = content;
			await documentActions.updateDocumentByPath(currentPath, buildUpdate(newPath, slug), 'manual');
			originalContent = savedContent;
			currentPath = newPath;

			await goto(`/documents/${newPath}`);
		} catch (error) {
			console.error('Failed to save document:', error);
			saveError = getErrorMessage(error, 'Failed to save document');
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
			await documentActions.deleteDocumentByPath(currentPath);
			showDeleteModal = false;
			goto('/');
		} catch (error) {
			console.error('Failed to delete document:', error);
			saveError = getErrorMessage(error, 'Failed to delete document');
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

	function clearAutoSave() {
		if (autoSaveTimer) {
			clearTimeout(autoSaveTimer);
			autoSaveTimer = null;
		}
	}

	function scheduleAutoSave() {
		clearAutoSave();

		if (content !== originalContent) {
			autoSaveTimer = setTimeout(async () => {
				autoSaveTimer = null;
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

		const slug = generateSlug(titleFromContent);
		const newPath = replaceLastPathSegment(currentPath, slug);
		try {
			const savedContent = content;
			await documentActions.updateDocumentByPath(currentPath, buildUpdate(newPath, slug), 'auto');
			markSaved(savedContent, newPath);
		} catch (error) {
			console.error('Failed to auto-save page:', error);
			saveError = getErrorMessage(error, 'Failed to auto-save page');
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
		clearAutoSave();
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
					Editing <span class="font-mono">/{currentPath}</span>
				</p>
			</div>

			<div class="flex items-center gap-3">
				<Button variant="outline" href="/documents/{currentPath}" data-testid="cancel-button">
					Cancel
				</Button>

				<!-- Delete lives in a menu so it never sits next to Save. -->
				<DropdownMenu.Root>
					<DropdownMenu.Trigger
						class="border-input bg-background hover:bg-accent hover:text-accent-foreground inline-flex h-9 w-9 items-center justify-center rounded-md border transition-colors"
						aria-label="More actions"
						title="More actions"
						data-testid="document-actions-menu"
					>
						<Ellipsis class="h-4 w-4" />
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end" class="w-44">
						<DropdownMenu.Item
							variant="destructive"
							onSelect={handleDeleteClick}
							disabled={isDeleting}
							data-testid="delete-document-button"
						>
							<Trash2 />
							Delete
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>

				<Button
					variant="default"
					data-testid="save-document-button"
					onclick={handleSave}
					disabled={isSaving || !content.trim() || documentExistence.exists}
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
		<ErrorAlert error={saveError} onDismiss={() => (saveError = '')} />
	{/if}

	<!-- Existence Warning -->
	{#if documentExistence.warning}
		<ErrorAlert
			error={documentExistence.warning}
			variant="warning"
			onDismiss={() => documentExistence.reset()}
		/>
	{/if}

	<!-- Content Editor -->
	<div class="bg-content ring-border-primary rounded-lg p-6 shadow-sm ring-1">
		<LazyEditor
			initialContent={document.content}
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
