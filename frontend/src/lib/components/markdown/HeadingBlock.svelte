<script lang="ts">
	import type { HeadingBlock } from '$lib/utils/markdown-blocks';

	let { block }: { block: HeadingBlock } = $props();

	const headingClasses = {
		1: 'text-4xl font-bold mt-8 mb-4',
		2: 'text-3xl font-bold mt-8 mb-4',
		3: 'text-2xl font-bold mt-6 mb-3',
		4: 'text-xl font-bold mt-6 mb-3',
		5: 'text-lg font-bold mt-6 mb-3',
		6: 'text-base font-bold mt-6 mb-3'
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
