<script lang="ts">
	import { tagsStore, tagActions, filteredDocumentsByTags } from '$lib/stores/tags';
	import ClickableTagBadge from './ClickableTagBadge.svelte';
	import { Button } from '$lib/components/ui/button';
	import { X } from 'lucide-svelte';

	const activeFilters = $derived($tagsStore.activeFilters);
	const filteredCount = $derived($filteredDocumentsByTags.length);
	const hasActiveFilters = $derived(activeFilters.length > 0);
</script>

{#if hasActiveFilters}
	<div class="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3">
		<div class="mb-2 flex items-center justify-between">
			<div class="flex items-center gap-2">
				<span class="text-sm font-medium text-blue-900"> Filtered by tags: </span>
				<span class="rounded bg-blue-100 px-2 py-1 text-xs text-blue-700">
					{filteredCount}
					{filteredCount === 1 ? 'document' : 'documents'} found
				</span>
			</div>
			<Button
				variant="ghost"
				size="sm"
				onclick={() => tagActions.clearTagFilters()}
				class="h-6 px-2 text-blue-700 hover:text-blue-900"
			>
				<X class="mr-1 h-3 w-3" />
				Clear all
			</Button>
		</div>

		<div class="flex flex-wrap gap-2">
			{#each activeFilters as filterTag (filterTag)}
				<ClickableTagBadge tag={filterTag} variant="secondary" clickable={true} showIcon={true} />
			{/each}
		</div>
	</div>
{/if}
