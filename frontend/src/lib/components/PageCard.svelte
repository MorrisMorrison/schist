<script lang="ts">
	import {
		Card,
		CardHeader,
		CardTitle,
		CardDescription,
		CardContent
	} from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Edit, Trash2, Eye, FolderOpen, Move } from 'lucide-svelte';
	import type { Page } from '$lib/api/types';
	import { getParentPath } from '$lib/api/types';

	interface Props {
		page: Page;
		showTags?: boolean;
		showDates?: boolean;
		showPath?: boolean;
		onEdit?: (slug: string) => void;
		onDelete?: (slug: string) => void;
		onView?: (path: string) => void;
		onMove?: (page: Page) => void;
	}

	let {
		page,
		showTags = true,
		showDates = true,
		showPath = true,
		onEdit,
		onDelete,
		onView,
		onMove
	}: Props = $props();

	function formatDate(dateString?: string): string {
		if (!dateString) return '';
		return new Date(dateString).toLocaleDateString();
	}

	function getExcerpt(content: string, maxLength: number = 120): string {
		// Remove markdown syntax for excerpt
		const plainText = content
			.replace(/#+\s/g, '') // Remove headers
			.replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
			.replace(/\*(.*?)\*/g, '$1') // Remove italic
			.replace(/\[(.*?)\]\(.*?\)/g, '$1') // Remove links
			.replace(/`(.*?)`/g, '$1') // Remove code
			.trim();

		return plainText.length > maxLength ? plainText.substring(0, maxLength) + '...' : plainText;
	}

	const pagePathDerived = $derived(page.metaData?.path || `/${page.metaData.slug}`);
	const parentFolderDerived = $derived(
		(() => {
			const parent = getParentPath(pagePathDerived);
			return parent === '/' ? 'Root' : parent.split('/').pop() || 'Root';
		})()
	);
</script>

<Card class="group border-border bg-card transition-all duration-200 hover:border-primary/20 hover:shadow-lg hover:shadow-primary/5">
	<CardHeader class="pb-4">
		<div class="space-y-3">
			<!-- Row 1: Title and Buttons -->
			<div class="flex items-start justify-between gap-4">
				<CardTitle
					class="hover:text-primary cursor-pointer truncate text-lg font-semibold leading-tight transition-colors"
					onclick={() => onView?.(pagePathDerived)}
				>
					{page.metaData.title}
				</CardTitle>

				<div class="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
					{#if onView}
						<Button variant="ghost" size="sm" onclick={() => onView(pagePathDerived)}>
							<Eye class="h-4 w-4" />
						</Button>
					{/if}
					{#if onEdit}
						<Button variant="ghost" size="sm" onclick={() => onEdit(page.metaData.path!)}>
							<Edit class="h-4 w-4" />
						</Button>
					{/if}
					{#if onMove}
						<Button variant="ghost" size="sm" onclick={() => onMove(page)}>
							<Move class="h-4 w-4" />
						</Button>
					{/if}
					{#if onDelete}
						<Button variant="ghost" size="sm" onclick={() => onDelete(page.metaData.slug!)}>
							<Trash2 class="text-destructive h-4 w-4" />
						</Button>
					{/if}
				</div>
			</div>

			<!-- Row 2: Path and Dates (full width) -->
			<div class="space-y-2">
				{#if showPath}
					<CardDescription class="text-muted-foreground flex items-center gap-1 text-sm">
						<FolderOpen class="h-3 w-3 flex-shrink-0" />
						<span class="truncate font-mono text-xs">{pagePathDerived}</span>
						{#if parentFolderDerived !== 'Root'}
							<span class="flex-shrink-0 text-xs">in {parentFolderDerived}</span>
						{/if}
					</CardDescription>
				{/if}

				{#if showDates}
					<CardDescription class="text-muted-foreground text-sm">
						{#if page.metaData.updated}
							Updated {formatDate(page.metaData.updated)}
						{:else if page.metaData.created}
							Created {formatDate(page.metaData.created)}
						{/if}
					</CardDescription>
				{/if}
			</div>
		</div>
	</CardHeader>

	<CardContent class="pt-0">
		<div class="space-y-4">
			{#if page.content}
				<p class="text-muted-foreground text-sm leading-relaxed">
					{getExcerpt(page.content)}
				</p>
			{/if}

			{#if showTags && page.metaData.tags && page.metaData.tags.length > 0}
				<div class="flex flex-wrap gap-2">
					{#each page.metaData.tags as tag (tag)}
						<Badge variant="secondary" class="text-xs">
							{tag}
						</Badge>
					{/each}
				</div>
			{/if}
		</div>
	</CardContent>
</Card>
