<script lang="ts">
	import type { ListItemBlock } from '$lib/utils/markdown-blocks';
	import { sanitizeHtml } from '$lib/utils/sanitizer';
	import Checkbox from '$lib/components/ui/checkbox/checkbox.svelte';

	let { block }: { block: ListItemBlock } = $props();
</script>

{#if block.task}
	<li class="mb-2 flex list-none items-start gap-3" data-testid="task-item">
		<Checkbox checked={block.checked} disabled={true} class="mt-0.5" />
		<span class="flex-1">{@html sanitizeHtml(block.text)}</span>
	</li>
{:else}
	<li class="mb-2">{@html sanitizeHtml(block.text)}</li>
{/if}
