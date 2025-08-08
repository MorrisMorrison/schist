<script lang="ts">
	import { Calendar, Tag, Eye } from 'lucide-svelte';
	import { Badge } from '$lib/components/ui/badge';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import {
		parseMarkdownWithCopyButtons,
		initializeMarkdownInteractions
	} from '$lib/utils/markdown';
	import type { PageData } from './$types';
	import { onMount } from 'svelte';

	const { data }: { data: PageData } = $props();
	const { document } = data;

	const documentTitle = $derived(document.metaData?.title || 'Untitled');
	const documentCreated = $derived(document.metaData?.created);
	const documentUpdated = $derived(document.metaData?.updated);
	const documentTags = $derived(document.metaData?.tags || []);

	let contentContainer = $state<HTMLElement>();
	let renderedMarkdown = $state('');

	function formatDate(dateString?: string): string {
		if (!dateString) return '';
		const date = new Date(dateString);
		return date.toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
	}

	// Render markdown content
	$effect(() => {
		const content = document?.content;

		if (content) {
			parseMarkdownWithCopyButtons(content)
				.then((html) => {
					renderedMarkdown = html;
				})
				.catch((error) => {
					console.error('Failed to parse markdown:', error);
					renderedMarkdown = `<div class="text-red-500 p-4 border border-red-200 dark:border-red-800 rounded">
						<p><strong>Error parsing content:</strong></p>
						<p>${error.message}</p>
						<details class="mt-2">
							<summary class="cursor-pointer">Raw content</summary>
							<pre class="mt-2 p-2 bg-muted rounded overflow-x-auto">${content}</pre>
						</details>
					</div>`;
				});
		} else {
			renderedMarkdown = '';
		}
	});

	// Initialize markdown interactions after content is rendered
	$effect(() => {
		if (renderedMarkdown && contentContainer) {
			setTimeout(() => {
				if (contentContainer) {
					initializeMarkdownInteractions(contentContainer);
				}
			}, 100);
		}
	});

	onMount(() => {
		// Set page title
		if (typeof window !== 'undefined') {
			window.document.title = `${documentTitle} - Shared Document`;
		}
	});
</script>

<svelte:head>
	<title>{documentTitle} - Shared Document</title>
	<meta name="description" content="Shared read-only document from Schist" />
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="mx-auto max-w-none space-y-8 flex-1 p-12">
	<!-- Page Header -->
	<header
		class="border-border flex flex-col gap-6 border-b pb-6 md:flex-row md:items-start md:justify-between"
	>
		<div class="flex-1">
			<h1 class="text-primary mb-4 text-4xl leading-tight font-bold">{documentTitle}</h1>

			<!-- Document Metadata -->
			<div class="flex flex-wrap items-center gap-4">
				{#if documentCreated}
					<div class="text-muted-foreground flex items-center gap-2 text-sm">
						<Calendar class="h-4 w-4" />
						<span>Created {formatDate(documentCreated)}</span>
					</div>
				{/if}

				{#if documentUpdated && documentUpdated !== documentCreated}
					<div class="text-muted-foreground flex items-center gap-2 text-sm">
						<Calendar class="h-4 w-4" />
						<span>Updated {formatDate(documentUpdated)}</span>
					</div>
				{/if}

				{#if documentTags && documentTags.length > 0}
					<div class="flex items-center gap-2" data-testid="document-tags">
						<Tag class="text-muted-foreground h-4 w-4" />
						<div class="flex flex-wrap gap-2">
							{#each documentTags as tag (tag)}
								<Badge variant="default" class="text-xs text-white" data-testid="document-tag"
									>{tag}</Badge
								>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		</div>

		<!-- Shared Document Indicator -->
		<div class="text-muted-foreground flex items-center gap-2 text-sm">
			<div class="rounded bg-blue-100 px-3 py-2 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200 flex items-center gap-2">
				<Eye class="h-4 w-4" />
				Shared Document (Read-only)
			</div>
		</div>
	</header>

	<!-- Document Content -->
	<main class="bg-content ring-border-primary rounded-lg p-8 shadow-sm ring-1">
		{#if renderedMarkdown}
			<div bind:this={contentContainer} class="prose prose-slate dark:prose-invert max-w-none">
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html renderedMarkdown}
			</div>
		{:else if document?.content}
			<div class="flex items-center justify-center py-8">
				<div class="text-muted-foreground">Loading content...</div>
			</div>
		{:else}
			<div class="flex flex-col items-center justify-center py-12 text-center">
				<p class="text-muted-foreground mb-4 text-lg">This document has no content yet.</p>
			</div>
		{/if}
	</main>

	<!-- Footer Info -->
	{#if document?.metaData?.path}
		<div class="text-muted-foreground text-center text-xs mb-8">
			Original document path: <code class="bg-muted rounded px-1 py-0.5"
				>{document.metaData.path}</code
			>
		</div>
	{/if}
</div>

<!-- Powered by Footer -->
<footer class="mt-auto border-t bg-background py-6">
	<div class="mx-auto flex max-w-7xl items-center justify-between px-12">
		<div class="flex items-center gap-2">
			<span class="text-muted-foreground text-sm">Powered by</span>
			<a 
				href="https://github.com/MorrisMorrison/schist" 
				target="_blank" 
				rel="noopener noreferrer"
				class="flex items-center text-sm font-medium text-primary hover:underline"
			>
				<img src="/icon-32x32.png" alt="Schist" class="h-8 w-8" />
				Schist
			</a>
		</div>
		<ThemeToggle size="sm" />
	</div>
</footer>

<style>
	/* Print styles */
	@media print {
		footer {
			display: none;
		}

		main {
			padding: 1rem 0;
		}
	}
</style>
