<script lang="ts">
	import { Card, CardHeader } from '$lib/components/ui/card';
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

	function formatDate(dateString?: string): string {
		if (!dateString) return '';
		return new Date(dateString).toLocaleDateString();
	}

	function getExcerpt(content: string, maxLength: number = 150): string {
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
</script>

<Card
	class="group border-border bg-card hover:border-primary/20 hover:shadow-primary/5 cursor-pointer transition-all duration-200 hover:shadow-lg {isSelected
		? 'ring-primary ring-2'
		: ''} relative"
	onclick={(e) => {
		if (enableMultiSelect) {
			onToggleSelect?.(e);
		} else {
			onView?.(documentPathDerived);
		}
	}}
>
	<CardHeader class="p-4">
		<div class="flex items-start gap-3">
			<!-- File Icon -->
									<div class="bg-primary/90  group-hover:bg-primary/70 flex-shrink-0 rounded-lg p-3 transition-colors">
										
				<FileText class="text-white h-4 w-4" />
			</div>

			<!-- Content Area -->
			<div class="min-w-0 flex-1">
				<!-- Title and Actions Row -->
				<div class="mb-2 flex items-start justify-between gap-2">
					<h3
						class="text-foreground truncate text-sm leading-tight font-medium"
						title={document.metaData.title}
					>
						{document.metaData.title}
					</h3>
					<div
						class="flex flex-shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100"
					>
						{#if onEdit}
							<Button
								variant="ghost"
								size="sm"
								class="hover:bg-primary/10 h-6 w-6 p-0"
								onclick={(e) => {
									e.stopPropagation();
									onEdit(document.metaData.path!);
								}}
							>
								<Edit class="h-3 w-3" />
							</Button>
						{/if}
						{#if onMove}
							<Button
								variant="ghost"
								size="sm"
								class="hover:bg-primary/10 h-6 w-6 p-0"
								onclick={(e) => {
									e.stopPropagation();
									onMove(document);
								}}
							>
								<Move class="h-3 w-3" />
							</Button>
						{/if}
						{#if onDelete}
							<Button
								variant="ghost"
								size="sm"
								class="hover:bg-destructive/10 h-6 w-6 p-0"
								onclick={(e) => {
									e.stopPropagation();
									onDelete(document.metaData.slug!);
								}}
							>
								<Trash2 class="text-destructive h-3 w-3" />
							</Button>
						{/if}
					</div>
				</div>

				<!-- Content Preview -->
				{#if document.content}
					<p class="text-muted-foreground/80 mb-2 line-clamp-2 text-xs leading-relaxed">
						{getExcerpt(document.content, 100)}
					</p>
				{/if}

				<!-- Metadata Row -->
				<div class="text-muted-foreground flex items-center justify-between text-xs">
					<div class="flex items-center gap-2">
						{#if showPath}
							<span class="truncate"
								>{parentFolderDerived !== 'Root' ? parentFolderDerived : 'Root'}</span
							>
						{/if}
						{#if showPath && showDates}
							<span>•</span>
						{/if}
						{#if showDates}
							<span class="whitespace-nowrap">
								{#if document.metaData.updated}
									{formatDate(document.metaData.updated)}
								{:else if document.metaData.created}
									{formatDate(document.metaData.created)}
								{/if}
							</span>
						{/if}
					</div>

					<!-- Tags -->
					{#if showTags && document.metaData.tags && document.metaData.tags.length > 0}
						<div class="flex flex-wrap gap-1">
							{#each document.metaData.tags.slice(0, 2) as tag (tag)}
								<Badge variant="secondary" class="h-4 px-1.5 py-0 text-xs">
									{tag}
								</Badge>
							{/each}
							{#if document.metaData.tags.length > 2}
								<Badge variant="secondary" class="h-4 px-1.5 py-0 text-xs">
									+{document.metaData.tags.length - 2}
								</Badge>
							{/if}
						</div>
					{/if}
				</div>
			</div>
		</div>
	</CardHeader>
</Card>
