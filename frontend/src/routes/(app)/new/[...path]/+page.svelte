<script lang="ts">
	import { goto } from '$app/navigation';
	import Editor from '$lib/components/editor/Editor.svelte';
	import { Button } from '$lib/components/ui/button';
	import { documentActions } from '$lib/stores/documents';
	import { generateSlug } from '$lib/utils/path';
	import { Check, CircleX, Loader2 } from 'lucide-svelte';
	import type { PageData } from './$types';
	import MarkdownInfoHelp from '$lib/components/editor/MarkdownInfoHelp.svelte';
	import { extractTitleFromContent, extractHashtagsFromContent } from '$lib/utils/content-parser';
	import { templatesStore, templateActions } from '$lib/stores/templates';
	import type { Template } from '$lib/api/types';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';

	let { data }: { data: PageData } = $props();
	let content = $state('# New Document\n\n');
	let isCreating = $state(false);
	let createError = $state('');

	let editorRef = $state<Editor>();

	const title = $derived(extractTitleFromContent(content));

	$effect(() => {
		templateActions.loadTemplates();
	});

	async function handleCreate() {
		if (!content.trim()) {
			createError = 'Content is required';
			return;
		}

		isCreating = true;
		createError = '';

		try {
			const tags = extractHashtagsFromContent(content);
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

	function applyTemplate(template: Template) {
		let templateContent = template.content;

		const now = new Date();
		const title = extractTitleFromContent(content) || template.title;

		templateContent = templateContent
			.replace(/\{\{date\}\}/g, now.toISOString().split('T')[0])
			.replace(/\{\{time\}\}/g, now.toTimeString().split(' ')[0])
			.replace(/\{\{title\}\}/g, title)
			.replace(
				/\{\{next_date\}\}/g,
				new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
			);

		content = templateContent;

		// Force immediate preview update using the Editor's public method
		if (editorRef) {
			editorRef.setContentImmediate(templateContent);
		}
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
				<h1 class="text-primary text-2xl font-bold">{title}</h1>
				<p class="text-secondary mt-1 text-sm">Add a new document to your wiki</p>
			</div>

			<div class="flex items-center space-x-3">
				<Button href="/" data-testid="cancel-button" variant="outline">Cancel</Button>
				<Button
					data-testid="save-document-button"
					onclick={handleCreate}
					disabled={isCreating || !content.trim()}
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

	<!-- Content Editor -->
	<div class="bg-content ring-border-primary rounded-lg p-6 shadow-sm ring-1">
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

	<!-- Template Suggestions -->
	<div class="bg-content rounded-lg p-6">
		<h3 class="text-primary mb-4 text-lg font-medium">Quick Start Templates</h3>

		{#if $templatesStore.loading}
			<div class="flex items-center justify-center py-8">
				<LoadingSpinner size="lg" />
				<span class="text-secondary ml-3">Loading templates...</span>
			</div>
		{:else if $templatesStore.error}
			<div class="py-8 text-center">
				<p class="text-red-600">Error: {$templatesStore.error}</p>
				<button
					onclick={() => templateActions.loadTemplates(true)}
					class="mt-2 text-sm text-blue-600 hover:text-blue-800"
				>
					Retry
				</button>
			</div>
		{:else if $templatesStore.templates.length === 0}
			<div class="py-8 text-center">
				<p class="text-secondary">No templates available</p>
			</div>
		{:else}
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each $templatesStore.templates as template (template.id)}
					<button
						type="button"
						onclick={() => applyTemplate(template)}
						class="border-primary bg-primary hover:border-secondary rounded-lg border p-4 text-left hover:shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none"
					>
						<h4 class="text-primary font-medium">{template.title}</h4>
						<p class="text-secondary mt-1 text-sm">{template.description}</p>
						{#if template.tags && template.tags.length > 0}
							<div class="mt-2 flex flex-wrap gap-1">
								{#each template.tags.slice(0, 2) as tag (tag)}
									<span class="bg-secondary text-secondary-foreground rounded px-2 py-0.5 text-xs"
										>{tag}</span
									>
								{/each}
								{#if template.tags.length > 2}
									<span class="text-secondary text-xs">+{template.tags.length - 2} more</span>
								{/if}
							</div>
						{/if}
					</button>
				{/each}
			</div>
		{/if}
	</div>

	<MarkdownInfoHelp showTaskExample={true} />
</div>
