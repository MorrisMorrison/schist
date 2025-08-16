<script lang="ts">
	import { goto } from '$app/navigation';
	import Editor from '$lib/components/editor/Editor.svelte';
	import DeleteConfirmModal from '$lib/components/modal/DeleteConfirmModal.svelte';
	import { Button } from '$lib/components/ui/button';
	import { documentActions } from '$lib/stores/documents.js';
	import { generateSlug } from '$lib/utils/path';
	import { Check, Trash2, RotateCcw } from 'lucide-svelte';
	import type { PageData } from './$types';
	import MarkdownInfoHelp from '$lib/components/editor/MarkdownInfoHelp.svelte';
	import { extractTitleFromContent, extractHashtagsFromContent } from '$lib/utils/content-parser';
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import { useDocumentExistence } from '$lib/composables/useDocumentExistence.svelte';

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

	const documentExistence = useDocumentExistence();

	const originalContent = document.content;

	const titleFromContent = $derived(extractTitleFromContent(content));

	$effect(() => {
		const title = titleFromContent;
		if (title.trim()) {
			const slug = generateSlug(title);
			const newPath = replaceLastPathSegment(data.path, slug);
			documentExistence.checkExistence(newPath, data.path);
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

		if (newPath !== data.path) {
			const exists = await documentActions.checkDocumentExists(newPath);
			if (exists) {
				saveError = `A document already exists at "${newPath}". Please choose a different title.`;
				isSaving = false;
				return;
			}
		}

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
		await handleSave();
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
		} catch (error) {
			console.error('Failed to auto-save page:', error);
			saveError = error instanceof Error ? error.message : 'Failed to auto-save page';
		} finally {
			isSaving = false;
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if ((event.ctrlKey || event.metaKey) && event.key === 's') {
			event.preventDefault();
			handleSave();
		}

		if (event.key === 'Escape' && showDeleteModal) {
			showDeleteModal = false;
		}
	}
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
