<script lang="ts">
	import { goto } from '$app/navigation';
	import Editor from '$lib/components/Editor.svelte';
	import MetadataEditor from '$lib/components/MetadataEditor.svelte';
	import DeleteConfirmModal from '$lib/components/DeleteConfirmModal.svelte';
	import { Button } from '$lib/components/ui/button';
	import { pageActions } from '$lib/stores/pages.js';
	import type { PageData } from './$types';
	import { generateSlug } from '$lib/utils/path';
	import { Check, Trash2, RotateCcw } from 'lucide-svelte';

	let { data }: { data: PageData } = $props();

	// Handle null page during SSR
	const page = data.page || {
		metaData: { title: '', tags: [], slug: '', path: '', created: '', updated: '' },
		content: ''
	};

	let title = $state(page.metaData.title);
	let content = $state(page.content);
	let tags = $state<string[]>(page.metaData.tags || []);
	let isSaving = $state(false);
	let saveError = $state('');
	let isDeleting = $state(false);
	let showDeleteModal = $state(false);

	// Single auto-save timer
	let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

	// Track original values to detect changes
	const originalTitle = page.metaData.title;
	const originalContent = page.content;
	const originalTags = JSON.stringify(page.metaData.tags || []);

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
		const slug = generateSlug(title);
		const newPath = replaceLastPathSegment(data.path, slug);
		try {
			// Use 'manual' saveType for manual saves to create git versions
			await pageActions.updatePageByPath(data.path, {
				...page,
				metaData: {
					...page.metaData,
					slug: slug,
					path: newPath,
					title: title.trim(),
					tags: tags
				},
				content: content.trim()
			}, 'manual');

			// Navigate back to the page view
			await goto(`/pages/${newPath}`);
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
			// Use 'auto' saveType for auto-saves to prevent version creation
			await pageActions.updatePageByPath(data.path, {
				...page,
				metaData: {
					...page.metaData,
					slug: slug,
					path: newPath,
					title: title.trim(),
					tags: tags
				},
				content: content.trim()
			}, 'auto');

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
	<title>Edit {page.metaData.title} - Schist Wiki</title>
	<meta name="description" content="Edit wiki page: {page.metaData.title}" />
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
				<Button variant="outline" href="/pages/{data.path}" data-testid="cancel-button">
					Cancel
				</Button>

				<Button
					variant="destructive"
					data-testid="delete-page-button"
					onclick={handleDeleteClick}
					disabled={isDeleting}
				>
					<Trash2 class="mr-2 h-4 w-4" />
					Delete
				</Button>

				<Button
					variant="default"
					data-testid="save-page-button"
					onclick={handleSave}
					disabled={isSaving || !title.trim() || !content.trim()}
				>
					{#if isSaving}
						<RotateCcw class="mr-2 h-4 w-4 animate-spin" />
						Saving...
					{:else}
						<Check class="mr-2 h-4 w-4" />
						Save Page
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
	<div class="bg-secondary ring-border-primary space-y-6 rounded-lg p-6 shadow-sm ring-1">
		<!-- Enhanced Metadata Editor -->
		<MetadataEditor
			{title}
			{tags}
			slug={page.metaData.slug}
			path={page.metaData.path}
			created={page.metaData.created}
			updated={page.metaData.updated}
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
				<h3 class="text-blue-primary text-sm font-medium dark:text-white">Markdown Tips</h3>
				<div class="text-blue-secondary mt-2 text-sm dark:text-white">
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
