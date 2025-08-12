<script lang="ts">
	import type { ListItemBlock } from '$lib/utils/markdown-blocks';
	import { sanitizeHtml } from '$lib/utils/sanitizer';

	let { block }: { block: ListItemBlock } = $props();
</script>

{#if block.task}
	<li>
		{#if block.checked}
			<input type="checkbox" checked disabled />
		{:else}
			<input type="checkbox" disabled />
		{/if}
		<span>{@html sanitizeHtml(block.text)}</span>
	</li>
{:else}
	<li>{@html sanitizeHtml(block.text)}</li>
{/if}
