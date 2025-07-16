<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { apiClient } from '$lib/api/client.js';
	import Editor from '$lib/components/Editor.svelte';

	// Get initial title from URL params if provided (e.g., from 404 page)
	const initialTitle = $derived($page.url.searchParams.get('title') || '');

	let title = $state('');
	let content = $state('');

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
			await apiClient.createPage({
				metaData: {
					title: title.trim(),
					tags: []
				},
				content: content.trim()
			});

			// Navigate to the new page
			// We need to generate a slug from the title
			const slug = title
				.trim()
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/^-|-$/g, '');
			goto(`/${slug}`);
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

	function generateSlugPreview(title: string): string {
		return (
			title
				.trim()
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/^-|-$/g, '') || 'new-page'
		);
	}
</script>

<svelte:head>
	<title>Create New Page - Schist Wiki</title>
	<meta name="description" content="Create a new wiki page" />
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-6">
	<!-- Header -->
	<div class="border-b border-primary pb-6">
		<div class="flex items-center justify-between">
			<div>
				<h1 class="text-2xl font-bold text-primary">Create New Page</h1>
				<p class="mt-1 text-sm text-secondary">Add a new page to your wiki</p>
			</div>

			<div class="flex items-center space-x-3">
				<a
					href="/"
					class="inline-flex items-center rounded-md bg-secondary px-3 py-2 text-sm font-medium text-primary hover:bg-gray-hover focus:bg-gray-active focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:outline-none"
				>
					Cancel
				</a>

				<button
					type="button"
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
						<svg class="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 4v16m8-8H4"
							/>
						</svg>
						Create Page
					{/if}
				</button>
			</div>
		</div>
	</div>

	<!-- Error Message -->
	{#if createError}
		<div class="rounded-md bg-red-muted p-4">
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
					<h3 class="text-sm font-medium text-red-primary">Error</h3>
					<div class="mt-2 text-sm text-red-secondary">
						<p>{createError}</p>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Editor Form -->
	<div class="space-y-6 rounded-lg bg-primary p-6 shadow-sm ring-1 border-primary">
		<!-- Title Input -->
		<div>
			<label for="title" class="block text-sm font-medium text-secondary">Page Title</label>
			<div class="mt-1">
				<input
					id="title"
					type="text"
					bind:value={title}
					placeholder="Enter page title..."
					class="block w-full rounded-md border border-secondary bg-primary text-primary px-3 py-2 placeholder-gray-500 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none sm:text-sm"
				/>
			</div>
			{#if title.trim()}
				<p class="mt-1 text-sm text-muted">
					URL will be: <span class="font-mono text-blue-primary">/{generateSlugPreview(title)}</span>
				</p>
			{/if}
		</div>

		<!-- Content Editor -->
		<div class="flex-1">
			<div class="h-96">
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
	<div class="rounded-lg bg-secondary p-6">
		<h3 class="mb-4 text-lg font-medium text-primary">Quick Start Templates</h3>
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
				class="rounded-lg border border-primary bg-primary p-4 text-left hover:border-secondary hover:shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none"
			>
				<h4 class="font-medium text-primary">Getting Started Guide</h4>
				<p class="mt-1 text-sm text-secondary">Step-by-step guide template</p>
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
				class="rounded-lg border border-primary bg-primary p-4 text-left hover:border-secondary hover:shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none"
			>
				<h4 class="font-medium text-primary">API Documentation</h4>
				<p class="mt-1 text-sm text-secondary">API reference template</p>
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
				class="rounded-lg border border-primary bg-primary p-4 text-left hover:border-secondary hover:shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none"
			>
				<h4 class="font-medium text-primary">Meeting Notes</h4>
				<p class="mt-1 text-sm text-secondary">Meeting notes template</p>
			</button>
		</div>
	</div>

	<!-- Help Text -->
	<div class="rounded-lg bg-blue-muted p-4">
		<div class="flex">
			<div class="flex-shrink-0">
				<svg class="h-5 w-5 text-blue-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
			</div>
			<div class="ml-3">
				<h3 class="text-sm font-medium text-blue-primary">Markdown Tips</h3>
				<div class="mt-2 text-sm text-blue-secondary">
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
