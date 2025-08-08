<script lang="ts">
	import { Calendar, Tag } from 'lucide-svelte';
	import { Badge } from '$lib/components/ui/badge';
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
		if (document?.content) {
			parseMarkdownWithCopyButtons(document.content).then((html) => {
				renderedMarkdown = html;
			});
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

<div class="bg-background min-h-screen">
	<!-- Header -->
	<header class="bg-background/95 border-b">
		<div class="container mx-auto px-4 py-4">
			<div class="text-muted-foreground text-sm">📄 Shared Document</div>
		</div>
	</header>

	<!-- Content -->
	<main class="container mx-auto px-4 py-8">
		<!-- Document Header -->
		<div class="mb-8 space-y-4">
			<h1 class="text-4xl font-bold tracking-tight">{documentTitle}</h1>

			<!-- Document metadata -->
			<div class="text-muted-foreground flex flex-wrap items-center gap-4 text-sm">
				{#if documentCreated}
					<div class="flex items-center gap-1">
						<Calendar class="h-4 w-4" />
						Created {formatDate(documentCreated)}
					</div>
				{/if}

				{#if documentUpdated && documentUpdated !== documentCreated}
					<div class="flex items-center gap-1">
						<Calendar class="h-4 w-4" />
						Updated {formatDate(documentUpdated)}
					</div>
				{/if}
			</div>

			<!-- Tags -->
			{#if documentTags && documentTags.length > 0}
				<div class="flex flex-wrap items-center gap-2">
					<Tag class="text-muted-foreground h-4 w-4" />
					{#each documentTags as tag (tag)}
						<Badge variant="secondary" class="text-xs">
							{tag}
						</Badge>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Document content -->
		{#if renderedMarkdown}
			<article class="prose prose-gray dark:prose-invert max-w-none" bind:this={contentContainer}>
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html renderedMarkdown}
			</article>
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

	<!-- Footer -->
	<footer class="bg-muted/50 mt-16 border-t">
		<div class="container mx-auto px-4 py-6">
			<div class="flex flex-col items-center justify-between gap-4 sm:flex-row">
				<div class="text-muted-foreground text-xs">
					This is a read-only shared document.
					{#if document?.metaData?.path}
						Original document path: <code class="bg-muted rounded px-1 py-0.5 text-xs"
							>{document.metaData.path}</code
						>
					{/if}
				</div>
			</div>
		</div>
	</footer>
</div>

<style>
	/* Print styles */
	@media print {
		header,
		footer {
			display: none;
		}

		.container {
			max-width: none;
			padding: 0;
		}

		main {
			padding: 1rem 0;
		}
	}
</style>
