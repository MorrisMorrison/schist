<script lang="ts">
	import { onMount } from 'svelte';
	import { tagActions, tagsStore, filteredDocumentsByTags } from '$lib/stores/tags';
	import { documentActions } from '$lib/stores/documents';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import DocumentGrid from '../document/DocumentGrid.svelte';
	import ClickableTagBadge from './ClickableTagBadge.svelte';
	import TagFilterChips from './TagFilterChips.svelte';
	import { Search, SlidersHorizontal, X, Tag, FileText } from 'lucide-svelte';

	interface Props {
		initialTags?: string[];
		showHeader?: boolean;
		maxHeight?: string;
	}

	let { initialTags = [], showHeader = true, maxHeight = '70vh' }: Props = $props();

	let searchQuery = $state('');
	let showAllTags = $state(false);
	let tagDisplayLimit = $state(20);

	// Filter tags based on search query
	const filteredAvailableTags = $derived((): import('$lib/api/types').TagInfo[] => {
		if (!searchQuery.trim()) {
			return $tagsStore.tags
				.sort((a, b) => b.count - a.count) // Sort by usage count
				.slice(0, showAllTags ? undefined : tagDisplayLimit);
		}

		const query = searchQuery.toLowerCase();
		return $tagsStore.tags
			.filter((tag) => tag.name.toLowerCase().includes(query))
			.sort((a, b) => {
				// Prioritize exact matches, then by count
				const aExact = a.name.toLowerCase() === query;
				const bExact = b.name.toLowerCase() === query;

				if (aExact && !bExact) return -1;
				if (!aExact && bExact) return 1;

				return b.count - a.count;
			});
	});

	const hasActiveFilters = $derived($tagsStore.activeFilters.length > 0);
	const filteredDocumentCount = $derived($filteredDocumentsByTags.length);

	onMount(() => {
		// Load tags and documents
		tagActions.loadTags();
		documentActions.loadDocuments();

		// Apply initial tags if provided
		if (initialTags.length > 0) {
			tagActions.clearTagFilters();
			initialTags.forEach((tag) => tagActions.addTagFilter(tag));
		}
	});

	function handleTagToggle(tagName: string) {
		tagActions.toggleTagFilter(tagName);
	}

	function clearAllFilters() {
		tagActions.clearTagFilters();
		searchQuery = '';
	}

	function isTagActive(tagName: string): boolean {
		return $tagsStore.activeFilters.includes(tagName);
	}
</script>

{#if showHeader}
	<Card class="border-border bg-card mb-6 shadow-sm">
		<CardHeader>
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-3">
					<div class="bg-primary/10 text-primary rounded-lg p-2">
						<SlidersHorizontal class="h-5 w-5" />
					</div>
					<CardTitle class="text-foreground text-lg font-semibold">Browse by Tags</CardTitle>
				</div>

				{#if hasActiveFilters}
					<Button variant="outline" size="sm" onclick={clearAllFilters}>
						<X class="h-4 w-4" />
						Clear All
					</Button>
				{/if}
			</div>
		</CardHeader>
		<CardContent>
			<!-- Tag Search -->
			<div class="mb-4">
				<div class="relative">
					<Search class="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
					<Input bind:value={searchQuery} placeholder="Search tags..." class="pl-9" />
					{#if searchQuery}
						<Button
							variant="ghost"
							size="sm"
							onclick={() => (searchQuery = '')}
							class="absolute top-1/2 right-1 h-6 w-6 -translate-y-1/2 p-0"
						>
							<X class="h-3 w-3" />
						</Button>
					{/if}
				</div>
			</div>

			<!-- Active Tag Filters -->
			<TagFilterChips />

			<!-- Available Tags -->
			{#if $tagsStore.loading}
				<div class="text-muted-foreground flex items-center gap-2 text-sm">
					<div
						class="border-border border-t-primary h-4 w-4 animate-spin rounded-full border-2"
					></div>
					<span>Loading tags...</span>
				</div>
			{:else if filteredAvailableTags.length > 0}
				<div class="space-y-4">
					<div class="flex items-center justify-between">
						<h3 class="text-sm font-medium">Available Tags</h3>
						{#if !searchQuery && $tagsStore.tags.length > tagDisplayLimit}
							<Button
								variant="ghost"
								size="sm"
								onclick={() => (showAllTags = !showAllTags)}
								class="text-xs"
							>
								{showAllTags ? 'Show Less' : `Show All (${$tagsStore.tags.length})`}
							</Button>
						{/if}
					</div>

					<div class="flex flex-wrap gap-2">
						{#each filteredAvailableTags() as tag (tag.name)}
							<div class="flex items-center gap-1">
								<ClickableTagBadge
									tag={tag.name}
									variant={isTagActive(tag.name) ? 'default' : 'outline'}
									clickable={true}
									onclick={() => handleTagToggle(tag.name)}
								/>
								<Badge variant="secondary" class="text-xs">
									{tag.count}
								</Badge>
							</div>
						{/each}
					</div>
				</div>
			{:else if searchQuery}
				<div
					class="text-muted-foreground flex flex-col items-center justify-center py-8 text-center"
				>
					<Tag class="mb-2 h-8 w-8" />
					<p>No tags found matching "{searchQuery}"</p>
				</div>
			{:else}
				<div
					class="text-muted-foreground flex flex-col items-center justify-center py-8 text-center"
				>
					<Tag class="mb-2 h-8 w-8" />
					<p>No tags available</p>
				</div>
			{/if}
		</CardContent>
	</Card>
{/if}

<!-- Document Results -->
{#if hasActiveFilters}
	<Card class="border-border bg-card shadow-sm">
		<CardHeader>
			<div class="flex items-center justify-between">
				<CardTitle class="flex items-center gap-2 text-lg">
					<FileText class="h-5 w-5" />
					Filtered Documents
					<Badge variant="secondary" class="text-sm">
						{filteredDocumentCount}
					</Badge>
				</CardTitle>
			</div>
		</CardHeader>
		<CardContent style="max-height: {maxHeight}; overflow-y: auto;">
			{#if filteredDocumentCount > 0}
				<DocumentGrid
					documents={$filteredDocumentsByTags}
					showPath={true}
					multiSelectMode={false}
					onMultiSelectModeChange={() => {}}
					emptyMessage="No documents found with the selected tags."
				/>
			{:else}
				<div class="flex flex-col items-center justify-center py-12 text-center">
					<FileText class="text-muted mb-4 h-12 w-12" />
					<h3 class="text-primary mb-2 text-lg font-medium">No matching documents</h3>
					<p class="text-muted-foreground mb-6 max-w-md">
						No documents have all the selected tags. Try removing some filters or selecting
						different tags.
					</p>
					<Button variant="outline" onclick={clearAllFilters}>
						<X class="h-4 w-4" />
						Clear Filters
					</Button>
				</div>
			{/if}
		</CardContent>
	</Card>
{:else if showHeader}
	<Card class="border-border bg-card shadow-sm">
		<CardContent class="flex flex-col items-center justify-center py-12 text-center">
			<div class="text-muted bg-muted/10 mb-4 rounded-full p-4">
				<SlidersHorizontal class="h-12 w-12" />
			</div>
			<h3 class="text-primary mb-2 text-lg font-medium">Select tags to browse</h3>
			<p class="text-muted-foreground max-w-md">
				Choose one or more tags above to find documents that match your criteria. You can combine
				multiple tags to narrow down your search.
			</p>
		</CardContent>
	</Card>
{/if}
