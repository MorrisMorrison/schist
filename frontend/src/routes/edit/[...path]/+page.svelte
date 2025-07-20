<script lang="ts">
	import { goto } from '$app/navigation';
	import Editor from '$lib/components/Editor.svelte';
	import TagInput from '$lib/components/TagInput.svelte';
	import DeleteConfirmModal from '$lib/components/DeleteConfirmModal.svelte';
	import { pageActions } from '$lib/stores/pages.js';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let title = $state(data.page.metaData.title);
	let content = $state(data.page.content);
	let tags = $state<string[]>(data.page.metaData.tags || []);
	let isSaving = $state(false);
	let saveError = $state('');
	let isDeleting = $state(false);
	let showDeleteModal = $state(false);

	// Single auto-save timer
	let autoSaveTimer: number | null = null;
	
	// Track original values to detect changes
	const originalTitle = data.page.metaData.title;
	const originalContent = data.page.content;
	const originalTags = JSON.stringify(data.page.metaData.tags || []);

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

		// We need to generate a slug from the title
		const slug = title
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '');
		const newPath = replaceLastPathSegment(data.path, slug);
		try {
			await pageActions.updatePageByPath(data.path, {
				...data.page,
				metaData: {
					...data.page.metaData,
					slug: slug,
					path: newPath,
					title: title.trim(),
					tags: tags
				},
				content: content.trim()
			});

			// Navigate back to the page view
			goto(`/pages/${newPath}`);
		} catch (error) {
			console.error('Failed to save page:', error);
			saveError = error instanceof Error ? error.message : 'Failed to save page';
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
			await pageActions.deletePageByPath(data.path);
			showDeleteModal = false;
			goto('/');
		} catch (error) {
			console.error('Failed to delete page:', error);
			saveError = error instanceof Error ? error.message : 'Failed to delete page';
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
		// Clear existing timer
		if (autoSaveTimer) {
			clearTimeout(autoSaveTimer);
		}
		
		// Only auto-save if there are actual changes
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

		// We need to generate a slug from the title
		const slug = title
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '');
		const newPath = replaceLastPathSegment(data.path, slug);
		try {
			await pageActions.updatePageByPath(data.path, {
				...data.page,
				metaData: {
					...data.page.metaData,
					slug: slug,
					path: newPath,
					title: title.trim(),
					tags: tags
				},
				content: content.trim()
			});

			// Don't navigate on autosave - just stay on the edit page
		} catch (error) {
			console.error('Failed to auto-save page:', error);
			saveError = error instanceof Error ? error.message : 'Failed to auto-save page';
		} finally {
			isSaving = false;
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		// Ctrl+S or Cmd+S to save
		if ((event.ctrlKey || event.metaKey) && event.key === 's') {
			event.preventDefault();
			handleSave();
		}

		// Escape to cancel delete confirmation
		if (event.key === 'Escape' && showDeleteModal) {
			showDeleteModal = false;
		}
	}
</script>

<svelte:head>
	<title>Edit {data.page.metaData.title} - Schist Wiki</title>
	<meta name="description" content="Edit wiki page: {data.page.metaData.title}" />
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

			<div class="flex items-center space-x-3">
				<a
					href="/pages/{data.path}"
					data-testid="cancel-button"
					class="bg-secondary text-primary hover:bg-gray-hover focus:bg-gray-active inline-flex items-center rounded-md px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:outline-none"
				>
					Cancel
				</a>

				<button
					type="button"
					data-testid="delete-page-button"
					onclick={handleDeleteClick}
					disabled={isDeleting}
					class="inline-flex items-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 focus:bg-red-500 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
				>
					<svg class="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
						/>
					</svg>
					Delete
				</button>

				<button
					type="button"
					data-testid="save-page-button"
					onclick={handleSave}
					disabled={isSaving || !title.trim() || !content.trim()}
					class="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus:bg-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
				>
					{#if isSaving}
						<svg
							class="mr-1.5 h-4 w-4 animate-spin"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
							/>
						</svg>
						Saving...
					{:else}
						<svg class="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M5 13l4 4L19 7"
							/>
						</svg>
						Save Page
					{/if}
				</button>
			</div>
		</div>
	</div>


	<!-- Error Message -->
	{#if saveError}
		<div class="bg-red-muted rounded-md p-4">
			<div class="flex">
				<div class="flex-shrink-0">
					<svg
						class="text-red-primary h-5 w-5"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
						/>
					</svg>
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
	<div class="bg-primary ring-border-primary space-y-6 rounded-lg p-6 shadow-sm ring-1">
		<!-- Title Input -->
		<div>
			<label for="title" class="text-secondary block text-sm font-medium">Page Title</label>
			<div class="mt-1">
				<input
					id="title"
					data-testid="page-title-input"
					type="text"
					bind:value={title}
					placeholder="Enter page title..."
					class="border-secondary bg-primary text-primary block w-full rounded-md border px-3 py-2 placeholder-gray-500 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none sm:text-sm"
				/>
			</div>
		</div>

		<!-- Tags Input (Compact) -->
		<div>
			<label for="tags" class="text-secondary mb-2 block text-sm font-medium">Tags</label>
			<div data-testid="tags-input-container">
				<TagInput {tags} onTagsChange={handleTagsChange} placeholder="Add tags..." />
			</div>
		</div>

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

	<!-- Help Text -->
	<div class="bg-blue-muted rounded-lg p-4">
		<div class="flex">
			<div class="flex-shrink-0">
				<svg
					class="text-blue-primary h-5 w-5"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
			</div>
			<div class="ml-3">
				<h3 class="text-blue-primary text-sm font-medium">Markdown Tips</h3>
				<div class="text-blue-secondary mt-2 text-sm">
					<ul class="list-inside list-disc space-y-1">
						<li><strong># Heading</strong> for main headings</li>
						<li><strong>**bold**</strong> for bold text</li>
						<li><strong>*italic*</strong> for italic text</li>
						<li><strong>[link](url)</strong> for links</li>
						<li><strong>```code```</strong> for code blocks</li>
					</ul>
				</div>
			</div>
		</div>
	</div>
</div>

<!-- Delete Confirmation Modal -->
<DeleteConfirmModal
	open={showDeleteModal}
	{isDeleting}
	onConfirm={handleDeleteConfirm}
	onCancel={handleDeleteCancel}
/>
