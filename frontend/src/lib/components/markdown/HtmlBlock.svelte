<script lang="ts">
	import type { HtmlBlock } from '$lib/utils/markdown-blocks';
	import { sanitizeHtml } from '$lib/utils/sanitizer';

	let { block }: { block: HtmlBlock } = $props();
</script>

<!-- Sanitize HTML content to prevent XSS attacks -->
<div class="html-block">{@html sanitizeHtml(block.html)}</div>
