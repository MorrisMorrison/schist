<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Editor from '$lib/components/Editor.svelte';
	import TagInput from '$lib/components/TagInput.svelte';
	import { pageActions } from '$lib/stores/pages';
	import { generateSlug } from '$lib/utils/path';
	import type { PageData } from './$types';

	// Get initial title from URL params if provided (e.g., from 404 page)
	const initialTitle = $derived(page.url.searchParams.get('title') || '');

	let { data }: { data: PageData } = $props();
	let title = $state('');
	let content = $state('');
	let tags = $state<string[]>([]);

	// Initialize title and content when initialTitle changes
	$effect(() => {
		if (initialTitle && !title) {
			title = initialTitle;
			content = '# ' + (initialTitle || 'New Page') + '\n\nWrite your content here...';
		} else if (!title && !content) {
			content = '# New Page\n\nWrite your content here...';
		}
	});
	let isCreating = $state(false);
	let createError = $state('');

	let editorRef: Editor;

	// Update content when title changes
	$effect(() => {
		if (title && !content.includes(title)) {
			content = `# ${title}\n\nWrite your content here...`;
		}
	});

	async function handleCreate() {
		if (!title.trim()) {
			createError = 'Title is required';
			return;
		}

		if (!content.trim()) {
			createError = 'Content is required';
			return;
		}

		isCreating = true;
		createError = '';

		try {
			const fullPath = generatePath(title);

			const response = await pageActions.createPage({
				metaData: {
					path: fullPath,
					title: title.trim(),
					tags: tags
				},
				content: content.trim()
			});

			// Navigate to the new page using the path returned by the API
			goto(`/pages${response.metaData.path}`);
		} catch (error) {
			console.error('Failed to create page:', error);
			createError = error instanceof Error ? error.message : 'Failed to create page';
		} finally {
			isCreating = false;
		}
	}

	function handleContentChange(newContent: string) {
		content = newContent;
	}

	async function handleSaveFromEditor(newContent: string) {
		content = newContent;
		await handleCreate();
	}

	function handleKeydown(event: KeyboardEvent) {
		// Ctrl+S or Cmd+S to save
		if ((event.ctrlKey || event.metaKey) && event.key === 's') {
			event.preventDefault();
			handleCreate();
		}
	}

	function generatePath(title: string): string {
		const slug = generateSlug(title);
		// Handle root path case - if data.path is empty or just "/", don't add extra slash
		if (!data.path || data.path === '/') {
			return `/${slug}`;
		}
		// Ensure data.path starts with "/" and doesn't end with "/"
		const cleanPath = data.path.startsWith('/') ? data.path : `/${data.path}`;
		const trimmedPath = cleanPath.endsWith('/') ? cleanPath.slice(0, -1) : cleanPath;
		return `${trimmedPath}/${slug}`;
	}
</script>

<svelte:head>
	<title>Create New Page - Schist Wiki</title>
	<meta name="description" content="Create a new wiki page" />
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="mx-auto max-w-7xl space-y-8 p-6">
	<!-- Header -->
	<div class="border-primary border-b pb-6">
		<div class="flex items-center justify-between">
			<div>
				<h1 class="text-primary text-2xl font-bold">Create New Page</h1>
				<p class="text-secondary mt-1 text-sm">Add a new page to your wiki</p>
			</div>

			<div class="flex items-center space-x-3">
				<a
					href="/"
					data-testid="cancel-button"
					class="bg-secondary text-primary hover:bg-gray-hover focus:bg-gray-active inline-flex items-center rounded-md px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:outline-none"
				>
					Cancel
				</a>

				<button
					type="button"
					data-testid="save-page-button"
					onclick={handleCreate}
					disabled={isCreating || !title.trim() || !content.trim()}
					class="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus:bg-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
				>
					{#if isCreating}
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
						Creating...
					{:else}
						<!-- <svg class="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 4v16m8-8H4"
							/>
						</svg> -->
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
	{#if createError}
		<div class="bg-red-muted rounded-md p-4">
			<div class="flex">
				<div class="flex-shrink-0">
					<svg class="h-5 w-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
						<p>{createError}</p>
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
			{#if title.trim()}
				<p class="text-muted mt-1 text-sm">
					URL will be: <span class="text-blue-primary font-mono">{generatePath(title)}</span>
				</p>
			{/if}
		</div>

		<!-- Tags Input (Compact) -->
		<div>
			<label for="tags" class="text-secondary mb-2 block text-sm font-medium">Tags</label>
			<div data-testid="tags-input-container">
				<TagInput {tags} onTagsChange={(newTags) => (tags = newTags)} placeholder="Add tags..." />
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

	<!-- Template Suggestions -->
	<div class="bg-secondary rounded-lg p-6">
		<h3 class="text-primary mb-4 text-lg font-medium">Quick Start Templates</h3>
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
			<button
				type="button"
				onclick={() => {
					title = 'Getting Started';
					content = `# Getting Started

Welcome to this page! Here's what you need to know:

## Overview
Brief description of what this page covers.

## Requirements
- Item 1
- Item 2
- Item 3

## Steps
1. First step
2. Second step
3. Third step

## Resources
- [Link 1](https://example.com)
- [Link 2](https://example.com)`;
				}}
				class="border-primary bg-primary hover:border-secondary rounded-lg border p-4 text-left hover:shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none"
			>
				<h4 class="text-primary font-medium">Getting Started Guide</h4>
				<p class="text-secondary mt-1 text-sm">Step-by-step guide template</p>
			</button>

			<button
				type="button"
				onclick={() => {
					title = 'API Documentation';
					content = `# API Documentation

## Overview
Brief description of the API.

## Authentication
How to authenticate with the API.

## Endpoints

### GET /endpoint
Description of the endpoint.

**Parameters:**
- \`param1\` (string) - Description

**Response:**
\`\`\`json
{
  "example": "response"
}
\`\`\`

## Examples
Code examples and usage.`;
				}}
				class="border-primary bg-primary hover:border-secondary rounded-lg border p-4 text-left hover:shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none"
			>
				<h4 class="text-primary font-medium">API Documentation</h4>
				<p class="text-secondary mt-1 text-sm">API reference template</p>
			</button>

			<button
				type="button"
				onclick={() => {
					title = 'Meeting Notes';
					content = `# Meeting Notes - ${new Date().toLocaleDateString()}

## Attendees
- Person 1
- Person 2
- Person 3

## Agenda
1. Topic 1
2. Topic 2
3. Topic 3

## Discussion

### Topic 1
Notes and decisions.

### Topic 2
Notes and decisions.

## Action Items
- [ ] Task 1 - Assigned to Person
- [ ] Task 2 - Assigned to Person

## Next Steps
What to do before the next meeting.`;
				}}
				class="border-primary bg-primary hover:border-secondary rounded-lg border p-4 text-left hover:shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none"
			>
				<h4 class="text-primary font-medium">Meeting Notes</h4>
				<p class="text-secondary mt-1 text-sm">Meeting notes template</p>
			</button>
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
						<li><strong>- [ ] Task</strong> for checkboxes</li>
					</ul>
				</div>
			</div>
		</div>
	</div>
</div>
