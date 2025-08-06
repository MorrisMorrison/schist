<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Editor from '$lib/components/Editor.svelte';
	import TagInput from '$lib/components/TagInput.svelte';
	import { Button } from '$lib/components/ui/button';
	import { documentActions } from '$lib/stores/documents';
	import { generateSlug } from '$lib/utils/path';
	import { Check, CircleX, Loader2 } from 'lucide-svelte';
	import type { PageData } from './$types';
	import Input from '$lib/components/ui/input/input.svelte';
	import MarkdownInfoHelp from '$lib/components/MarkdownInfoHelp.svelte';

	const initialTitle = $derived(page.url.searchParams.get('title') || '');

	let { data }: { data: PageData } = $props();
	let title = $state('');
	let content = $state('');
	let tags = $state<string[]>([]);

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

			const response = await documentActions.createDocument({
				metaData: {
					path: fullPath,
					title: title.trim(),
					tags: tags
				},
				content: content.trim()
			});

			goto(`/documents${response.metaData.path}`);
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
		if ((event.ctrlKey || event.metaKey) && event.key === 's') {
			event.preventDefault();
			handleCreate();
		}
	}

	function generatePath(title: string): string {
		const slug = generateSlug(title);
		if (!data.path || data.path === '/') {
			return `/${slug}`;
		}
		const cleanPath = data.path.startsWith('/') ? data.path : `/${data.path}`;
		const trimmedPath = cleanPath.endsWith('/') ? cleanPath.slice(0, -1) : cleanPath;
		return `${trimmedPath}/${slug}`;
	}
</script>

<svelte:head>
	<title>Create New Document - Schist</title>
	<meta name="description" content="Create a new document" />
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="mx-auto max-w-7xl space-y-8 p-6">
	<!-- Header -->
	<div class="border-primary border-b pb-6">
		<div class="flex items-center justify-between">
			<div>
				<h1 class="text-primary text-2xl font-bold">Create New Document</h1>
				<p class="text-secondary mt-1 text-sm">Add a new document to your wiki</p>
			</div>

			<div class="flex items-center space-x-3">
				<Button href="/" data-testid="cancel-button" variant="outline">Cancel</Button>
				<Button
					data-testid="save-document-button"
					onclick={handleCreate}
					disabled={isCreating || !title.trim() || !content.trim()}
				>
					{#if isCreating}
						<Loader2 class="h-4 w-4 animate-spin"></Loader2>
						Creating...
					{:else}
						<Check class="h-4 w-4"></Check>
						Save Document
					{/if}
				</Button>
			</div>
		</div>
	</div>

	<!-- Error Message -->
	{#if createError}
		<div class="bg-red-muted rounded-md p-4">
			<div class="flex">
				<div class="flex-shrink-0">
					<CircleX class="h-5 w-5 text-red-400"></CircleX>
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
			<label for="title" class="text-secondary block text-sm font-medium">Document Title</label>
			<div class="mt-1">
				<Input
					id="title"
					data-testid="document-title-input"
					type="text"
					bind:value={title}
					placeholder="Enter document title..."
				></Input>
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
	<div class="bg-content rounded-lg p-6">
		<h3 class="text-primary mb-4 text-lg font-medium">Quick Start Templates</h3>
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
			<button
				type="button"
				onclick={() => {
					title = 'Getting Started';
					content = `# Getting Started

Welcome to this Document! Here's what you need to know:

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

	<MarkdownInfoHelp showTaskExample={true} />
</div>
