<script lang="ts">
	import type { HtmlBlock } from '#lib/utils/markdown-blocks.ts';
	import { sanitizeHtml } from '#lib/utils/sanitizer.ts';

	let { block }: { block: HtmlBlock } = $props();
</script>

<!-- Sanitize HTML content to prevent XSS attacks -->
<div class="html-block">{@html sanitizeHtml(block.html)}</div>
