<script lang="ts">
	import type { ListBlock } from '$lib/utils/markdown-blocks';
	import ListItemBlock from './ListItemBlock.svelte';

	let { block }: { block: ListBlock } = $props();
</script>

{#if block.ordered}
	<ol class="mb-4 list-inside list-decimal">
		{#each block.items as item (item.id)}
			<ListItemBlock block={item} />
		{/each}
	</ol>
{:else}
	<ul class="mb-4 list-inside list-disc">
		{#each block.items as item (item.id)}
			<ListItemBlock block={item} />
		{/each}
	</ul>
{/if}
