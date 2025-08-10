<script lang="ts">
	import type { CodeBlock } from '$lib/utils/markdown-blocks';
	import CopyButton from '$lib/components/CopyButton.svelte';

	let { block }: { block: CodeBlock } = $props();
</script>

<div class="code-block-container group bg-muted/30 relative my-4 rounded-lg border">
	<div class="bg-muted/50 flex items-center justify-between border-b px-4 py-2">
		{#if block.language}
			<span class="code-lang text-muted-foreground bg-muted rounded px-2 py-1 text-xs">
				{block.language}
			</span>
		{:else}
			<div></div>
		{/if}
		<CopyButton
			text={block.code}
			size="sm"
			variant="ghost"
			class="text-muted-foreground hover:text-foreground"
		/>
	</div>
	<pre class="overflow-x-auto p-4 text-sm leading-relaxed"><code
			class="hljs language-{block.language || ''}">{@html block.highlighted}</code
		></pre>
</div>
