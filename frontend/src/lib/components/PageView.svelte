<script lang="ts">
	import { Edit, Trash2, Move, Calendar, Tag } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import Breadcrumbs from './Breadcrumbs.svelte';
	import {
		parseMarkdownWithCopyButtons,
		initializeCodeBlockCopyButtons
	} from '$lib/utils/markdown';
	import type { Page } from '$lib/api/types';

	interface Props {
		page: Page;
		onEdit?: (slug: string) => void;
		onDelete?: (slug: string) => void;
		onView?: (slug: string) => void;
		onMove?: (page: Page) => void;
	}

	let { page, onEdit = () => {}, onDelete = () => {}, onMove = () => {} }: Props = $props();

	const pagePath = $derived(page.metaData?.path || `/${page.metaData?.slug}`);
	const pageTitle = $derived(page.metaData?.title || 'Untitled');
	const pageSlug = $derived(page.metaData?.slug || '');
	const pageCreated = $derived(page.metaData?.created);
	const pageUpdated = $derived(page.metaData?.updated);
	const pageTags = $derived(page.metaData?.tags || []);

	// DOM reference for the content container
	let contentContainer = $state<HTMLDivElement>();

	function formatDate(dateString?: string): string {
		if (!dateString) return '';
		const date = new Date(dateString);
		return date.toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
	}

	// Enhanced markdown rendering with copy buttons
	let renderedMarkdown = $state('');

	// Parse markdown content asynchronously
	$effect(() => {
		if (page.content) {
			parseMarkdownWithCopyButtons(page.content).then((html) => {
				renderedMarkdown = html;
			});
		} else {
			renderedMarkdown = '';
		}
	});

	// Initialize copy buttons after content is rendered
	$effect(() => {
		if (contentContainer && renderedMarkdown) {
			// Use a small delay to ensure DOM is updated
			setTimeout(() => {
				if (contentContainer) {
					initializeCodeBlockCopyButtons(contentContainer);
				}
			}, 0);
		}
	});
</script>

<svelte:head>
	<title>{pageTitle}</title>
	<meta name="description" content={page.content?.slice(0, 160) || ''} />
</svelte:head>

<div class="mx-auto max-w-7xl space-y-8 p-6">
	<!-- Breadcrumbs -->
	<Breadcrumbs path={pagePath} currentPageTitle={pageTitle} />

	<!-- Page Header -->
	<header
		class="border-border flex flex-col gap-6 border-b pb-6 md:flex-row md:items-start md:justify-between"
	>
		<div class="flex-1">
			<h1 class="text-primary mb-4 text-4xl leading-tight font-bold">{pageTitle}</h1>

			<!-- Page Metadata -->
			<div class="flex flex-wrap items-center gap-4">
				{#if pageCreated}
					<div class="text-muted-foreground flex items-center gap-2 text-sm">
						<Calendar class="h-4 w-4" />
						<span>Created {formatDate(pageCreated)}</span>
					</div>
				{/if}

				{#if pageUpdated && pageUpdated !== pageCreated}
					<div class="text-muted-foreground flex items-center gap-2 text-sm">
						<Calendar class="h-4 w-4" />
						<span>Updated {formatDate(pageUpdated)}</span>
					</div>
				{/if}
				{#if pageTags.length > 0}
					<div class="flex items-center gap-2 pt-2">
						<Tag class="text-muted-foreground h-4 w-4" />
						<div class="flex flex-wrap gap-2">
							{#each pageTags as tag (tag)}
								<Badge variant="default" class="bg-blue-600 text-xs text-white hover:bg-blue-500"
									>{tag}</Badge
								>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		</div>

		<!-- Action Buttons -->
		<div class="flex gap-2">
			<Button variant="outline" size="sm" onclick={() => onEdit(pageSlug)} title="Edit page">
				<Edit class="h-4 w-4" />
				Edit
			</Button>

			<Button variant="outline" size="sm" onclick={() => onMove(page)} title="Move page">
				<Move class="h-4 w-4" />
				Move
			</Button>

			<Button
				variant="destructive"
				size="sm"
				onclick={() => onDelete(pagePath)}
				title="Delete page"
			>
				<Trash2 class="h-4 w-4" />
				Delete
			</Button>
		</div>
	</header>

	<!-- Page Content -->
	<main class="bg-primary ring-border-primary rounded-lg p-8 shadow-sm ring-1">
		{#if page.content}
			<div bind:this={contentContainer} class="prose prose-slate dark:prose-invert max-w-none">
				<!-- TODO FIX CSS !!!! -->
				{@html renderedMarkdown}
			</div>
		{:else}
			<div class="flex flex-col items-center justify-center py-12 text-center">
				<p class="text-muted-foreground mb-6 text-lg">This page has no content yet.</p>
				<Button onclick={() => onEdit(pageSlug)}>
					<Edit class="h-4 w-4" />
					Add Content
				</Button>
			</div>
		{/if}
	</main>
</div>

<style>
	/* Code block enhancements */
	/* :global(.code-block-container) {
		@apply border-border bg-muted relative mb-4 rounded-lg border;
	}

	:global(.code-block-header) {
		@apply border-border bg-muted/50 flex items-center justify-between border-b px-4 py-2;
	}

	:global(.code-lang) {
		@apply text-muted-foreground text-xs font-medium tracking-wide uppercase;
	}

	:global(.copy-button) {
		@apply bg-background/50 border-border/50 text-muted-foreground hover:text-foreground hover:bg-background hover:border-border flex h-8 w-8 items-center justify-center rounded-md border transition-all duration-200;
	}

	:global(.copy-button:hover) {
		@apply shadow-sm;
	}

	:global(.copy-button:focus) {
		@apply ring-primary ring-2 ring-offset-2 outline-none;
	}

	:global(.copy-icon) {
		@apply h-4 w-4;
	}

	:global(.code-block-container pre) {
		@apply m-0 rounded-none border-0 bg-transparent p-4;
	}

	:global(.code-block-container code) {
		@apply bg-transparent text-sm;
	}

	:global(.inline-code) {
		@apply bg-muted border-border rounded border px-1.5 py-0.5 text-sm;
	} */
</style>
