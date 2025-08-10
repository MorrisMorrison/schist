<script lang="ts">
	import type { ImageBlock } from '$lib/utils/markdown-blocks';
	import { sanitizeHtml } from '$lib/utils/sanitizer';

	let { block }: { block: ImageBlock } = $props();

	// Parse size from title if present (supports "Title|size" format)
	const parseImageTitle = (title?: string) => {
		if (!title) return { cleanTitle: undefined, size: undefined };

		const parts = title.split('|');
		if (parts.length === 2) {
			return {
				cleanTitle: parts[0].trim() || undefined,
				size: parts[1].trim() || undefined
			};
		}

		return { cleanTitle: title, size: undefined };
	};

	const { cleanTitle, size } = parseImageTitle(block.title);

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
	<img
		src={block.href}
		alt={sanitizeHtml(block.text)}
		title={cleanTitle ? sanitizeHtml(cleanTitle) : undefined}
		class="rounded-lg shadow-sm {getSizeClasses(size)}"
		loading="lazy"
	/>
	{#if block.text && block.text !== cleanTitle}
		<p class="text-muted-foreground mt-2 text-center text-sm italic">
			{sanitizeHtml(block.text)}
		</p>
	{/if}
</div>
