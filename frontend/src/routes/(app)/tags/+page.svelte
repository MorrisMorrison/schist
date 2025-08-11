<script lang="ts">
	import { onMount } from 'svelte';
	import { tagActions, tagsStore } from '$lib/stores/tags';
	import { documentsStore, documentActions } from '$lib/stores/documents';
	import { goto } from '$app/navigation';
	import { Badge } from '$lib/components/ui/badge';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Tag, FileText, TrendingUp, Hash } from 'lucide-svelte';
	import ClickableTagBadge from '$lib/components/tags/ClickableTagBadge.svelte';
	import TagDocumentBrowser from '$lib/components/tags/TagDocumentBrowser.svelte';
	import type { TagInfo } from '$lib/api/types';

	let sortBy = $state<'name' | 'count' | 'recent'>('count');
	let sortOrder = $state<'asc' | 'desc'>('desc');

	const sortedTags = $derived((): TagInfo[] => {
		const tags = [...$tagsStore.tags];

		return tags.sort((a, b) => {
			let comparison = 0;

			switch (sortBy) {
				case 'name':
					comparison = a.name.localeCompare(b.name);
					break;
				case 'count':
					comparison = a.count - b.count;
					break;
				case 'recent':
					// For recent, we'd need last_used date from backend
					// For now, fall back to count
					comparison = a.count - b.count;
					break;
			}

			return sortOrder === 'desc' ? -comparison : comparison;
		});
	});

	const tagsWithCategories = $derived(() => {
		const popular = sortedTags().filter((tag) => tag.count >= 3);
		const common = sortedTags().filter((tag) => tag.count === 2);
		const rare = sortedTags().filter((tag) => tag.count === 1);

		return { popular, common, rare };
	});

	const totalTags = $derived($tagsStore.tags.length);
	const totalDocumentsWithTags = $derived(() => {
		return $documentsStore.documents.filter(
			(doc) => doc.metaData?.tags && doc.metaData.tags.length > 0
		).length;
	});

	onMount(() => {
		tagActions.loadTags(true);
		documentActions.loadDocuments();
	});

	function handleTagClick(tagName: string) {
		tagActions.clearTagFilters();
		tagActions.addTagFilter(tagName);
		goto('/documents');
	}

	function getTagDescription(tag: TagInfo): string {
		if (tag.count === 1) return '1 document';
		return `${tag.count} documents`;
	}
</script>

<svelte:head>
	<title>Tags - Schist</title>
	<meta name="description" content="Browse and manage all tags in your knowledge base" />
</svelte:head>

<div class="mx-auto max-w-7xl space-y-8 p-6">
	<!-- Page Header -->
	<header
		class="border-border flex flex-col gap-6 border-b pb-6 md:flex-row md:items-start md:justify-between"
	>
		<div class="flex-1">
			<div class="mb-4 flex items-center gap-3">
				<div class="bg-primary/10 text-primary rounded-lg p-2">
					<Tag class="h-6 w-6" />
				</div>
				<h1 class="text-primary text-4xl font-bold">Tags</h1>
			</div>

			<p class="text-muted-foreground mb-4 text-lg">Explore and organize your knowledge by tags</p>

			{#if $tagsStore.loading}
				<div class="text-muted-foreground flex items-center gap-2 text-sm">
					<div
						class="border-border border-t-primary h-4 w-4 animate-spin rounded-full border-2"
					></div>
					<span>Loading tags...</span>
				</div>
			{:else}
				<div class="flex flex-wrap items-center gap-4">
					<div class="text-muted-foreground flex items-center gap-2 text-sm">
						<Hash class="h-4 w-4" />
						<span>{totalTags} {totalTags === 1 ? 'tag' : 'tags'} total</span>
					</div>
					<div class="text-muted-foreground flex items-center gap-2 text-sm">
						<FileText class="h-4 w-4" />
						<span>{totalDocumentsWithTags} tagged documents</span>
					</div>
				</div>
			{/if}
		</div>

		<!-- Controls -->
		<div
			class="flex w-full flex-col items-start gap-2 md:w-auto md:flex-row md:items-center md:gap-4"
		>
			<div class="bg-secondary flex items-center gap-1 rounded-lg border p-2 md:gap-2">
				<label class="text-secondary text-sm font-medium" for="sort-select">Sort by:</label>
				<select
					bind:value={sortBy}
					class="bg-primary text-primary cursor-pointer rounded border px-2 py-1 text-sm"
					id="sort-select"
				>
					<option value="count">Usage</option>
					<option value="name">Name</option>
					<option value="recent">Recent</option>
				</select>
				<Button
					variant="outline"
					size="sm"
					onclick={() => (sortOrder = sortOrder === 'asc' ? 'desc' : 'asc')}
					title={sortOrder === 'asc' ? 'Sort descending' : 'Sort ascending'}
				>
					{sortOrder === 'asc' ? '↑' : '↓'}
				</Button>
			</div>
		</div>
	</header>

	{#if $tagsStore.error}
		<Card class="border-destructive">
			<CardContent class="pt-6">
				<div class="text-destructive flex items-center gap-2">
					<div class="text-destructive bg-destructive/10 rounded p-2">
						<Tag class="h-5 w-5" />
					</div>
					<div>
						<h3 class="font-semibold">Error loading tags</h3>
						<p class="text-muted-foreground text-sm">{$tagsStore.error}</p>
					</div>
				</div>
			</CardContent>
		</Card>
	{/if}

	{#if totalTags === 0 && !$tagsStore.loading}
		<!-- Empty State -->
		<Card class="border-border">
			<CardContent class="flex flex-col items-center justify-center py-12 text-center">
				<div class="text-muted bg-muted/10 mb-4 rounded-full p-4">
					<Tag class="h-12 w-12" />
				</div>
				<h3 class="text-primary mb-2 text-lg font-medium">No tags yet</h3>
				<p class="text-muted-foreground mb-6 max-w-md">
					Tags help you organize and find your documents. Add tags to your documents to see them
					here.
				</p>
				<Button onclick={() => goto('/documents')}>
					<FileText class="h-4 w-4" />
					Browse Documents
				</Button>
			</CardContent>
		</Card>
	{:else if sortedTags.length > 0}
		<!-- Tags Overview Stats -->
		<div class="grid gap-6 md:grid-cols-3">
			<Card>
				<CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle class="text-sm font-medium">Popular Tags</CardTitle>
					<TrendingUp class="text-muted-foreground h-4 w-4" />
				</CardHeader>
				<CardContent>
					<div class="text-2xl font-bold">{tagsWithCategories().popular.length}</div>
					<p class="text-muted-foreground text-xs">Used 3+ times</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle class="text-sm font-medium">Common Tags</CardTitle>
					<Hash class="text-muted-foreground h-4 w-4" />
				</CardHeader>
				<CardContent>
					<div class="text-2xl font-bold">{tagsWithCategories().common.length}</div>
					<p class="text-muted-foreground text-xs">Used 2 times</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle class="text-sm font-medium">Unique Tags</CardTitle>
					<Tag class="text-muted-foreground h-4 w-4" />
				</CardHeader>
				<CardContent>
					<div class="text-2xl font-bold">{tagsWithCategories().rare.length}</div>
					<p class="text-muted-foreground text-xs">Used once</p>
				</CardContent>
			</Card>
		</div>

		<!-- Tags Grid -->
		<Card class="border-border bg-card shadow-sm">
			<CardHeader>
				<div class="flex items-center justify-between">
					<CardTitle class="text-foreground text-xl font-semibold">All Tags</CardTitle>
					<Badge variant="secondary" class="text-xs">
						{sortedTags.length}
						{sortedTags.length === 1 ? 'tag' : 'tags'}
					</Badge>
				</div>
			</CardHeader>
			<CardContent>
				<div class="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
					{#each sortedTags() as tag (tag.name)}
						<Card class="hover:bg-muted/50 cursor-pointer transition-colors">
							<CardContent class="p-4">
								<button
									class="w-full text-left"
									onclick={() => handleTagClick(tag.name)}
									title={`View documents tagged with "${tag.name}"`}
								>
									<div class="mb-3 flex items-start justify-between gap-2">
										<ClickableTagBadge
											tag={tag.name}
											variant="default"
											showIcon={true}
											clickable={false}
										/>
										<Badge variant="outline" class="text-xs">
											{tag.count}
										</Badge>
									</div>

									<p class="text-muted-foreground text-sm">
										{getTagDescription(tag)}
									</p>
								</button>
							</CardContent>
						</Card>
					{/each}
				</div>
			</CardContent>
		</Card>

		<!-- Tag Document Browser -->
		<TagDocumentBrowser showHeader={true} />
	{/if}
</div>
