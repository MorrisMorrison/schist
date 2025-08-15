<script lang="ts">
	import type { HeadingBlock } from '$lib/utils/markdown-blocks';

	let { block }: { block: HeadingBlock } = $props();

	const headingClasses = {
		1: 'markdown-heading-1',
		2: 'markdown-heading-2',
		3: 'markdown-heading-3',
		4: 'markdown-heading-4',
		5: 'markdown-heading-5',
		6: 'markdown-heading-6'
	};
</script>

{#if block.level === 1}
	<h1 class={headingClasses[1]}>{@html block.text}</h1>
{:else if block.level === 2}
	<h2 class={headingClasses[2]}>{@html block.text}</h2>
{:else if block.level === 3}
	<h3 class={headingClasses[3]}>{@html block.text}</h3>
{:else if block.level === 4}
	<h4 class={headingClasses[4]}>{@html block.text}</h4>
{:else if block.level === 5}
	<h5 class={headingClasses[5]}>{@html block.text}</h5>
{:else if block.level === 6}
	<h6 class={headingClasses[6]}>{@html block.text}</h6>
{/if}

<style>
	:global(.markdown-heading-1) {
		font-size: 2rem;
		font-weight: bold;
		margin-bottom: 1rem;
	}

	:global(.markdown-heading-2) {
		font-size: 1.625rem;
		font-weight: bold;
		margin-bottom: 1rem;
	}

	:global(.markdown-heading-3) {
		font-size: 1.375rem;
		font-weight: bold;
		margin-bottom: 0.75rem;
	}

	:global(.markdown-heading-4) {
		font-size: 1.125rem;
		font-weight: bold;
		margin-bottom: 0.75rem;
	}

	:global(.markdown-heading-5) {
		font-size: 1rem;
		font-weight: bold;
		margin-bottom: 0.75rem;
	}

	:global(.markdown-heading-6) {
		font-size: 0.875rem;
		font-weight: bold;
		margin-bottom: 0.75rem;
	}
</style>
