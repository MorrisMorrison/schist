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
	import { Edit, Trash2, Move, FileText } from 'lucide-svelte';
	import type { Document } from '$lib/api/types';
	import { getParentPath } from '$lib/api/types';

	interface Props {
		document: Document;
		showTags?: boolean;
		showDates?: boolean;
		showPath?: boolean;
		onEdit?: (slug: string) => void;
		onDelete?: (slug: string) => void;
		onView?: (path: string) => void;
		onMove?: (document: Document) => void;
	}

	let {
		document,
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

	const documentPathDerived = $derived(document.metaData?.path || `/${document.metaData.slug}`);
	const parentFolderDerived = $derived(
		(() => {
			const parent = getParentPath(documentPathDerived);
			return parent === '/' ? 'Root' : parent.split('/').pop() || 'Root';
		})()
	);
</script>

<Card
	class="group border-border bg-card hover:border-primary/20 hover:shadow-primary/5 cursor-pointer transition-all duration-200 hover:shadow-lg"
	onclick={() => onView?.(documentPathDerived)}
>
	<CardHeader class="pb-3">
		<div class="flex min-w-0 items-start gap-4">
			<div
				class="bg-primary/90 group-hover:bg-primary/70 flex-shrink-0 rounded-lg p-3 transition-colors"
			>
				<FileText class="h-5 w-5 flex-shrink-0 text-white" />
			</div>
			<div class="min-w-0 flex-1 space-y-1 overflow-hidden">
				<div class="flex items-start gap-2">
					<CardTitle
						class="min-w-0 flex-1 truncate pr-2 text-base leading-tight font-semibold"
						title={document.metaData.title}
					>
						{document.metaData.title}
					</CardTitle>
					<div
						class="flex flex-shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100"
					>
						{#if onEdit}
							<Button
								variant="ghost"
								size="sm"
								class="hover:bg-primary/10 transition-all duration-200 hover:scale-105"
								onclick={(e) => {
									e.stopPropagation();
									onEdit(document.metaData.path!);
								}}
							>
								<Edit class="h-4 w-4" />
							</Button>
						{/if}
						{#if onMove}
							<Button
								variant="ghost"
								size="sm"
								class="hover:bg-primary/10 transition-all duration-200 hover:scale-105"
								onclick={(e) => {
									e.stopPropagation();
									onMove(document);
								}}
							>
								<Move class="h-4 w-4" />
							</Button>
						{/if}
						{#if onDelete}
							<Button
								variant="ghost"
								size="sm"
								class="hover:bg-destructive/10 transition-all duration-200 hover:scale-105"
								onclick={(e) => {
									e.stopPropagation();
									onDelete(document.metaData.slug!);
								}}
							>
								<Trash2 class="text-destructive h-4 w-4" />
							</Button>
						{/if}
					</div>
				</div>

				<!-- Compact metadata -->
				<CardDescription class="text-muted-foreground text-sm">
					{#if showPath && showDates}
						{parentFolderDerived !== 'Root' ? parentFolderDerived : 'Root'} •
						{#if document.metaData.updated}
							Updated {formatDate(document.metaData.updated)}
						{:else if document.metaData.created}
							Created {formatDate(document.metaData.created)}
						{/if}
					{:else if showPath}
						{parentFolderDerived !== 'Root' ? parentFolderDerived : 'Root'}
					{:else if showDates}
						{#if document.metaData.updated}
							Updated {formatDate(document.metaData.updated)}
						{:else if document.metaData.created}
							Created {formatDate(document.metaData.created)}
						{/if}
					{/if}
				</CardDescription>
			</div>
		</div>
	</CardHeader>

	{#if document.content || (showTags && document.metaData.tags && document.metaData.tags.length > 0)}
		<CardContent class="space-y-3 pt-0">
			{#if document.content}
				<p class="text-muted-foreground text-sm leading-relaxed">
					{getExcerpt(document.content)}
				</p>
			{/if}

			{#if showTags && document.metaData.tags && document.metaData.tags.length > 0}
				<div class="flex flex-wrap gap-1.5">
					{#each document.metaData.tags as tag (tag)}
						<Badge variant="default" class="px-2 py-0.5 text-xs">
							{tag}
						</Badge>
					{/each}
				</div>
			{/if}
		</CardContent>
	{/if}
</Card>
