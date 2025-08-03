<script lang="ts">
	import { goto } from '$app/navigation';
	import Editor from '$lib/components/Editor.svelte';
	import MetadataEditor from '$lib/components/MetadataEditor.svelte';
	import DeleteConfirmModal from '$lib/components/DeleteConfirmModal.svelte';
	import { Button } from '$lib/components/ui/button';
	import { documentActions } from '$lib/stores/documents.js';
	import { generateSlug } from '$lib/utils/path';
	import { Check, Trash2, RotateCcw, CircleX } from 'lucide-svelte';
	import type { PageData } from './$types';
	import MarkdownInfoHelp from '$lib/components/MarkdownInfoHelp.svelte';

	let { data }: { data: PageData } = $props();

	// Handle null page during SSR
	const document = data.document || {
		metaData: { title: '', tags: [], slug: '', path: '', created: '', updated: '' },
		content: ''
	};

	let title = $state(document.metaData.title);
	let content = $state(document.content);
	let tags = $state<string[]>(document.metaData.tags || []);
	let isSaving = $state(false);
	let saveError = $state('');
	let isDeleting = $state(false);
	let showDeleteModal = $state(false);

	let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

	const originalTitle = document.metaData.title;
	const originalContent = document.content;
	const originalTags = JSON.stringify(document.metaData.tags || []);

	let editorRef: Editor;
	function replaceLastPathSegment(path: string, newSegment: string): string {
		const parts = path.split('/').filter(Boolean);
		if (parts.length === 0) return newSegment;
		parts[parts.length - 1] = newSegment;
		return parts.join('/');
	}
	async function handleSave() {
		if (!title.trim()) {
			saveError = 'Title is required';
			return;
		}

		if (!content.trim()) {
			saveError = 'Content is required';
			return;
		}

		isSaving = true;
		saveError = '';

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

	function handleTagsChange(newTags: string[]) {
		tags = newTags;
		scheduleAutoSave();
	}

	function scheduleAutoSave() {
		if (autoSaveTimer) {
			clearTimeout(autoSaveTimer);
		}

		const hasChanges =
			title !== originalTitle ||
			content !== originalContent ||
			JSON.stringify(tags) !== originalTags;

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
		if (!title.trim()) {
			saveError = 'Title is required';
			return;
		}

		if (!content.trim()) {
			saveError = 'Content is required';
			return;
		}

		isSaving = true;
		saveError = '';

		const slug = title
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '');
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
				<h1 class="text-primary text-2xl font-bold">Edit Page</h1>
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
					disabled={isSaving || !title.trim() || !content.trim()}
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

	<!-- Editor Form -->
	<div class="bg-content ring-border-primary space-y-6 rounded-lg p-6 shadow-sm ring-1">
		<!-- Enhanced Metadata Editor -->
		<MetadataEditor
			{title}
			{tags}
			slug={document.metaData.slug}
			path={document.metaData.path}
			created={document.metaData.created}
			updated={document.metaData.updated}
			onTitleChange={(newTitle) => {
				title = newTitle;
				scheduleAutoSave();
			}}
			onTagsChange={handleTagsChange}
			showAdvanced={false}
		/>

		<!-- Content Editor -->
		<div class="flex-1">
			<div class="w-full">
				<Editor
					bind:this={editorRef}
					initialContent={content}
					onContentChange={handleContentChange}
					onSave={handleSaveFromEditor}
					autoSave={{
						enabled: false
					}}
				/>
			</div>
		</div>
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
