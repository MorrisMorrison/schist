<script lang="ts">
	import { Edit, Trash2, Move, Calendar, Tag, User } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import Breadcrumbs from './Breadcrumbs.svelte';
	import type { Page } from '$lib/api/types';

	interface Props {
		page: Page;
		onEdit?: (slug: string) => void;
		onDelete?: (slug: string) => void;
		onView?: (slug: string) => void;
		onMove?: (page: Page) => void;
	}

	let {
		page,
		onEdit = () => {},
		onDelete = () => {},
		onView = () => {},
		onMove = () => {}
	}: Props = $props();

	const pagePath = $derived(page.metaData?.path || `/${page.metaData?.slug}`);
	const pageTitle = $derived(page.metaData?.title || 'Untitled');
	const pageSlug = $derived(page.metaData?.slug || '');
	const pageCreated = $derived(page.metaData?.created);
	const pageUpdated = $derived(page.metaData?.updated);
	const pageTags = $derived(page.metaData?.tags || []);

	function formatDate(dateString?: string): string {
		if (!dateString) return '';
		const date = new Date(dateString);
		return date.toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
	}

	function renderMarkdown(content: string): string {
		// Basic markdown rendering - in a real app, you'd use a proper markdown parser
		return content
			.replace(/^### (.*$)/gm, '<h3>$1</h3>')
			.replace(/^## (.*$)/gm, '<h2>$1</h2>')
			.replace(/^# (.*$)/gm, '<h1>$1</h1>')
			.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
			.replace(/\*(.*?)\*/g, '<em>$1</em>')
			.replace(/`(.*?)`/g, '<code>$1</code>')
			.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>')
			.replace(/\n\n/g, '</p><p>')
			.replace(/\n/g, '<br>');
	}
</script>

<svelte:head>
	<title>{pageTitle}</title>
	<meta name="description" content={page.content?.slice(0, 160) || ''} />
</svelte:head>

<div class="mx-auto max-w-7xl space-y-8 p-6">
	<!-- Breadcrumbs -->
	<Breadcrumbs path={pagePath} currentPageTitle={pageTitle} />

	<!-- Page Header -->
	<header class="flex flex-col gap-6 border-b border-border pb-6 md:flex-row md:items-start md:justify-between">
		<div class="flex-1">
			<h1 class="text-primary mb-4 text-4xl font-bold leading-tight">{pageTitle}</h1>

			<!-- Page Metadata -->
			<div class="flex flex-wrap items-center gap-4">
				{#if pageCreated}
					<div class="flex items-center gap-2 text-sm text-muted-foreground">
						<Calendar class="h-4 w-4" />
						<span>Created {formatDate(pageCreated)}</span>
					</div>
				{/if}

				{#if pageUpdated && pageUpdated !== pageCreated}
					<div class="flex items-center gap-2 text-sm text-muted-foreground">
						<Calendar class="h-4 w-4" />
						<span>Updated {formatDate(pageUpdated)}</span>
					</div>
				{/if}

				{#if pageTags.length > 0}
					<div class="flex items-center gap-2">
						<Tag class="h-4 w-4 text-muted-foreground" />
						<div class="flex flex-wrap gap-2">
							{#each pageTags as tag}
								<Badge variant="default" class="bg-blue-600 text-white hover:bg-blue-500 text-xs">{tag}</Badge>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		</div>

		<!-- Action Buttons -->
		<div class="flex gap-2">
			<Button
				variant="outline"
				size="sm"
				onclick={() => onEdit(pageSlug)}
				title="Edit page"
			>
				<Edit class="h-4 w-4" />
				Edit
			</Button>

			<Button
				variant="outline"
				size="sm"
				onclick={() => onMove(page)}
				title="Move page"
			>
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
			<div class="prose prose-slate max-w-none dark:prose-invert">
				{@html renderMarkdown(page.content)}
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

