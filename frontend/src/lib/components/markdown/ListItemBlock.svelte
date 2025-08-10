<script lang="ts">
	import type { ListItemBlock } from '$lib/utils/markdown-blocks';
	import { sanitizeHtml } from '$lib/utils/sanitizer';

	let { block }: { block: ListItemBlock } = $props();
</script>

<li class="mb-2">{@html sanitizeHtml(block.text)}</li>
