<script lang="ts">
	import type { HtmlBlock } from '$lib/utils/markdown-blocks';

	let { block }: { block: HtmlBlock } = $props();
</script>

<!-- Only render HTML blocks that we trust - could add minimal sanitization here if needed -->
<div class="html-block">{@html block.html}</div>
