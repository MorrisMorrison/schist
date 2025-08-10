<script lang="ts">
	import type { MarkdownBlock } from '$lib/utils/markdown-blocks';
	import { parseMarkdownToBlocks } from '$lib/utils/markdown-blocks';

	import HeadingBlock from './HeadingBlock.svelte';
	import ParagraphBlock from './ParagraphBlock.svelte';
	import CodeBlock from './CodeBlock.svelte';
	import ListBlock from './ListBlock.svelte';
	import BlockquoteBlock from './BlockquoteBlock.svelte';
	import TableBlock from './TableBlock.svelte';
	import HrBlock from './HrBlock.svelte';
	import HtmlBlock from './HtmlBlock.svelte';
	import ImageBlock from './ImageBlock.svelte';

	let { content = '' }: { content: string } = $props();

	let blocks: MarkdownBlock[] = $state([]);
	let loading = $state(false);
	let error = $state<string | null>(null);

	// Parse markdown content into blocks
	$effect(() => {
		if (!content) {
			blocks = [];
			return;
		}

		loading = true;
		error = null;

		parseMarkdownToBlocks(content)
			.then((parsedBlocks) => {
				blocks = parsedBlocks;
			})
			.catch((err) => {
				console.error('Error parsing markdown:', err);
				error = 'Failed to parse markdown content';
				blocks = [];
			})
			.finally(() => {
				loading = false;
			});
	});
</script>

{#if loading}
	<div class="flex items-center justify-center p-4">
		<div class="text-muted-foreground">Loading...</div>
	</div>
{:else if error}
	<div class="p-4 text-red-500">
		{error}
	</div>
{:else if blocks.length === 0}
	<div class="text-muted-foreground p-4">No content to display</div>
{:else}
	<div class="prose max-w-none">
		{#each blocks as block (block.id)}
			{#if block.type === 'heading'}
				<HeadingBlock {block} />
			{:else if block.type === 'paragraph'}
				<ParagraphBlock {block} />
			{:else if block.type === 'code'}
				<CodeBlock {block} />
			{:else if block.type === 'list'}
				<ListBlock {block} />
			{:else if block.type === 'blockquote'}
				<BlockquoteBlock {block} />
			{:else if block.type === 'table'}
				<TableBlock {block} />
			{:else if block.type === 'hr'}
				<HrBlock {block} />
			{:else if block.type === 'html'}
				<HtmlBlock {block} />
			{:else if block.type === 'image'}
				<ImageBlock {block} />
			{:else}
				<!-- Fallback for unknown block types -->
				<div class="rounded border border-yellow-300 p-2 text-yellow-600">
					Unknown block type: {block.type}
				</div>
			{/if}
		{/each}
	</div>
{/if}
