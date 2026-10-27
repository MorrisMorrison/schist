<script lang="ts">
	import type { ImageBlock } from '#lib/utils/markdown-blocks.ts';
	import { sanitizeHtml } from '#lib/utils/sanitizer.ts';
	import { imageLightboxActions } from '#lib/stores/image-lightbox.svelte.ts';
	import { apiClient } from '#lib/api/client.ts';

	let { block }: { block: ImageBlock } = $props();

	function handleImageClick() {
		imageLightboxActions.open(transformedSrc, block.text);
	}

	// Use the size parsed from markdown-blocks.ts
	const cleanTitle = $derived(block.title);
	const size = $derived(block.size);

	// Transform asset URLs
	const transformedSrc = $derived.by(() => {
		const pathWithoutQuery = block.href.split('?')[0];
		if (pathWithoutQuery.startsWith('/assets/')) {
			return apiClient.getAssetUrl(block.href);
		}
		return block.href;
	});

	// Determine size classes
	const getSizeClasses = (size?: string): string => {
		switch (size?.toLowerCase()) {
			case 'small':
				return 'max-w-xs';
			case 'medium':
				return 'max-w-md';
			case 'large':
				return 'max-w-lg';
			case 'full':
				return 'w-full';
			default:
				return 'max-w-full';
		}
	};
</script>

<div class="my-4">
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<img
		src={transformedSrc}
		alt={sanitizeHtml(block.text)}
		title={cleanTitle ? sanitizeHtml(cleanTitle) : undefined}
		class="cursor-pointer rounded-lg shadow-sm transition-opacity hover:opacity-90 {getSizeClasses(
			size
		)}"
		loading="lazy"
		onclick={handleImageClick}
	/>
	{#if block.text && block.text !== cleanTitle}
		<p class="text-muted-foreground mt-2 text-center text-sm italic">
			{sanitizeHtml(block.text)}
		</p>
	{/if}
</div>
