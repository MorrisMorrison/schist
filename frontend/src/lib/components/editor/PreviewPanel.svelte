<script lang="ts">
	import MarkdownPreview from './MarkdownPreview.svelte';
	import type { PreviewPanelProps } from '$lib/types/editor';

	let {
		content = '',
		theme = 'light',
		container = $bindable(),
		onScroll
	}: PreviewPanelProps = $props();

	let previewContainer = $state<HTMLElement | null>(null);

	$effect(() => {
		container = previewContainer;
	});

	function _handleScroll() {
		if (onScroll) {
			onScroll();
		}
	}
</script>

<div class="flex w-1/2 min-w-0 flex-col">
	<div
		class="border-primary bg-background flex min-h-[3rem] items-center justify-between border-b px-4 py-2"
	>
		<span class="text-sm font-medium">Preview</span>
	</div>
	<div class="flex-1 overflow-hidden">
		<MarkdownPreview {content} {theme} bind:container={previewContainer} {onScroll} />
	</div>
</div>
