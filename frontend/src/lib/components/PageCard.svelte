<script lang="ts">
	import {
		Card,
		CardHeader,
		CardTitle,
		CardDescription,
		CardContent
	} from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Edit, Trash2, Eye } from 'lucide-svelte';
	import type { Page } from '$lib/api/types.js';

	interface Props {
		page: Page;
		showTags?: boolean;
		showDates?: boolean;
		onEdit?: (slug: string) => void;
		onDelete?: (slug: string) => void;
		onView?: (slug: string) => void;
	}

	let { page, showTags = true, showDates = true, onEdit, onDelete, onView }: Props = $props();

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
</script>

<Card class="transition-shadow hover:shadow-md">
	<CardHeader class="pb-3">
		<div class="flex items-start justify-between">
			<div class="flex-1">
				<CardTitle
					class="hover:text-primary cursor-pointer text-lg font-semibold"
					onclick={() => onView?.(page.metaData.slug!)}
				>
					{page.metaData.title}
				</CardTitle>
				{#if showDates}
					<CardDescription class="text-muted-foreground mt-1 text-sm">
						{#if page.metaData.updated}
							Updated {formatDate(page.metaData.updated)}
						{:else if page.metaData.created}
							Created {formatDate(page.metaData.created)}
						{/if}
					</CardDescription>
				{/if}
			</div>
			<div class="ml-2 flex gap-1">
				{#if onView}
					<Button variant="ghost" size="sm" onclick={() => onView(page.metaData.slug!)}>
						<Eye class="h-4 w-4" />
					</Button>
				{/if}
				{#if onEdit}
					<Button variant="ghost" size="sm" onclick={() => onEdit(page.metaData.slug!)}>
						<Edit class="h-4 w-4" />
					</Button>
				{/if}
				{#if onDelete}
					<Button variant="ghost" size="sm" onclick={() => onDelete(page.metaData.slug!)}>
						<Trash2 class="text-destructive h-4 w-4" />
					</Button>
				{/if}
			</div>
		</div>
	</CardHeader>

	<CardContent class="pt-0">
		{#if page.content}
			<p class="text-muted-foreground mb-3 text-sm">
				{getExcerpt(page.content)}
			</p>
		{/if}

		{#if showTags && page.metaData.tags && page.metaData.tags.length > 0}
			<div class="flex flex-wrap gap-1">
				{#each page.metaData.tags as tag (tag)}
					<Badge variant="secondary" class="text-xs">
						{tag}
					</Badge>
				{/each}
			</div>
		{/if}
	</CardContent>
</Card>
