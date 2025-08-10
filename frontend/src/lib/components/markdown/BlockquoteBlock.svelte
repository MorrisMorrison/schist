<script lang="ts">
	import type { BlockquoteBlock } from '$lib/utils/markdown-blocks';
	import { sanitizeHtml } from '$lib/utils/sanitizer';

	let { block }: { block: BlockquoteBlock } = $props();
</script>

<blockquote
	class="my-4 border-l-4 border-gray-300 pl-4 text-gray-700 italic dark:border-gray-600 dark:text-gray-300"
>
	{@html sanitizeHtml(block.text)}
</blockquote>
