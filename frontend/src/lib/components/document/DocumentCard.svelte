<script lang="ts">
	import { Card } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Edit, Trash2, Move, FileText, Clock, Folder } from '@lucide/svelte';
	import type { Document } from '$lib/api/types';
	import { getParentPath } from '$lib/utils/path';
	import { formatRelativeDate } from '$lib/utils/date';
	import { getDocumentColor } from '$lib/utils/document-color';

	interface Props {
		document: Document;
		showTags?: boolean;
		showDates?: boolean;
		showPath?: boolean;
		enableMultiSelect?: boolean;
		isSelected?: boolean;
		onEdit?: (slug: string) => void;
		onDelete?: (slug: string) => void;
		onView?: (path: string) => void;
		onMove?: (document: Document) => void;
		onToggleSelect?: (event: Event) => void;
	}

	let {
		document,
		showTags = true,
		showDates = true,
		showPath = true,
		enableMultiSelect = false,
		isSelected = false,
		onEdit,
		onDelete,
		onView,
		onMove,
		onToggleSelect
	}: Props = $props();

	function getExcerpt(content: string, maxLength: number = 180): string {
		// Remove markdown syntax for excerpt
		const plainText = content
			.replace(/---[\s\S]*?---/g, '') // Remove frontmatter
			.replace(/#+\s/g, '') // Remove headers
			.replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
			.replace(/\*(.*?)\*/g, '$1') // Remove italic
			.replace(/\[(.*?)\]\(.*?\)/g, '$1') // Remove links
			.replace(/`(.*?)`/g, '$1') // Remove inline code
			.replace(/```[\s\S]*?```/g, '') // Remove code blocks
			.replace(/>\s/g, '') // Remove blockquotes
			.replace(/[-*+]\s/g, '') // Remove list markers
			.replace(/\n+/g, ' ') // Replace newlines with spaces
			.replace(/\s+/g, ' ') // Normalize whitespace
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

	// Get document color using semantic keyword matching
	const documentColor = $derived(getDocumentColor(document.metaData.title));
</script>

<Card
	class="group border-border/50 bg-card/50 hover:border-border hover:bg-card hover:shadow-primary/5 relative cursor-pointer overflow-hidden border backdrop-blur-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg {isSelected
		? 'ring-primary/50 shadow-primary/10 shadow-lg ring-2'
		: ''}"
	onclick={(e) => {
		if (enableMultiSelect) {
			onToggleSelect?.(e);
		} else {
			onView?.(documentPathDerived);
		}
	}}
	data-testid="document-card"
>
	<!-- Document header with gradient icon -->
	<div class="relative p-6 pb-4">
		<!-- Background pattern for visual interest -->
		<div
			class="from-primary/5 to-primary/10 absolute inset-0 bg-gradient-to-br opacity-0 transition-opacity duration-300 group-hover:opacity-100"
		></div>

		<div class="relative flex items-start gap-4">
			<!-- Enhanced gradient icon -->
			<div class="flex-shrink-0">
				<div
					class="relative h-12 w-12 rounded-xl bg-gradient-to-br {documentColor} p-2.5 shadow-sm transition-all duration-300 group-hover:scale-105 group-hover:shadow-md"
				>
					<FileText class="h-full w-full text-white drop-shadow-sm" />
					<!-- Subtle glow effect -->
					<div
						class="absolute inset-0 rounded-xl bg-gradient-to-br {documentColor} -z-10 opacity-50 blur-sm"
					></div>
				</div>
			</div>

			<!-- Title and actions -->
			<div class="min-w-0 flex-1">
				<div class="flex items-start justify-between gap-3">
					<h3
						class="text-foreground group-hover:text-primary line-clamp-2 text-lg leading-snug font-semibold tracking-tight transition-colors"
						title={document.metaData.title}
					>
						{document.metaData.title}
					</h3>

					<!-- Action buttons - more discoverable -->
					<div
						class="flex flex-shrink-0 gap-1 opacity-60 transition-all duration-200 group-hover:opacity-100"
					>
						{#if onEdit}
							<Button
								variant="ghost"
								size="sm"
								class="hover:bg-primary/10 hover:text-primary h-8 w-8 p-0"
								onclick={(e) => {
									e.stopPropagation();
									onEdit(document.metaData.path!);
								}}
								title="Edit document"
							>
								<Edit class="h-4 w-4" />
							</Button>
						{/if}
						{#if onMove}
							<Button
								variant="ghost"
								size="sm"
								class="hover:bg-primary/10 hover:text-primary h-8 w-8 p-0"
								onclick={(e) => {
									e.stopPropagation();
									onMove(document);
								}}
								title="Move document"
							>
								<Move class="h-4 w-4" />
							</Button>
						{/if}
						{#if onDelete}
							<Button
								variant="ghost"
								size="sm"
								class="hover:bg-destructive/10 hover:text-destructive h-8 w-8 p-0"
								onclick={(e) => {
									e.stopPropagation();
									onDelete(document.metaData.slug!);
								}}
								title="Delete document"
							>
								<Trash2 class="h-4 w-4" />
							</Button>
						{/if}
					</div>
				</div>

				<!-- Tags positioned under title -->
				{#if showTags && document.metaData.tags && document.metaData.tags.length > 0}
					<div class="mt-3 flex flex-wrap gap-1.5">
						{#each document.metaData.tags.slice(0, 3) as tag (tag)}
							<Badge
								variant="outline"
								class="border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 h-6 px-2.5 py-0.5 text-xs font-medium"
							>
								{tag}
							</Badge>
						{/each}
						{#if document.metaData.tags.length > 3}
							<Badge
								variant="outline"
								class="border-muted-foreground/20 bg-muted/50 text-muted-foreground h-6 px-2.5 py-0.5 text-xs font-medium"
							>
								+{document.metaData.tags.length - 3}
							</Badge>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- Content preview -->
	{#if document.content}
		<div class="px-6 pb-4">
			<p class="text-muted-foreground line-clamp-3 text-sm leading-relaxed">
				{getExcerpt(document.content, 180)}
			</p>
		</div>
	{/if}

	<!-- Footer with metadata -->
	<div class="border-border/30 bg-muted/20 mt-auto border-t px-6 py-4">
		<div class="flex items-center justify-between gap-3 text-xs">
			<!-- Path and date info -->
			<div class="text-muted-foreground flex min-w-0 items-center gap-2">
				{#if showPath}
					<div class="flex items-center gap-1.5">
						<Folder class="h-3.5 w-3.5" />
						<span class="truncate font-medium">{parentFolderDerived}</span>
					</div>
				{/if}

				{#if showDates && showPath}
					<span class="text-muted-foreground/50">•</span>
				{/if}

				{#if showDates}
					<div class="flex items-center gap-1.5">
						<Clock class="h-3.5 w-3.5" />
						<span class="whitespace-nowrap">
							{#if document.metaData.updated}
								{formatRelativeDate(document.metaData.updated)}
							{:else if document.metaData.created}
								{formatRelativeDate(document.metaData.created)}
							{/if}
						</span>
					</div>
				{/if}
			</div>
		</div>
	</div>
</Card>
