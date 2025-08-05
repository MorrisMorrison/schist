<script lang="ts">
	import type { PreviewProps } from '$lib/types/editor';
	import {
		parseMarkdownWithCopyButtons,
		initializeMarkdownInteractions
	} from '$lib/utils/markdown';
	import ImageLightbox from './ImageLightbox.svelte';
	import { imageLightbox, imageLightboxActions } from '$lib/stores/image-lightbox';

	let { content, theme = 'light', className = '' }: PreviewProps = $props();

	let containerRef: HTMLDivElement;

	let htmlContent = $state('');

	$effect(() => {
		const updateContent = async () => {
			try {
				htmlContent = await parseMarkdownWithCopyButtons(content);
				if (containerRef) {
					initializeMarkdownInteractions(containerRef);
				}
			} catch (error) {
				console.error('Markdown parsing error:', error);
				htmlContent = '<p class="text-red-500">Error parsing markdown content</p>';
			}
		};
		updateContent();
	});

	const themeClasses = $derived(
		theme === 'dark' ? 'bg-gray-900 text-gray-100 dark' : 'bg-white text-gray-900'
	);

	const proseClasses = 'prose max-w-none';
</script>

<div
	bind:this={containerRef}
	class="markdown-preview h-full overflow-auto border-l {themeClasses} {className}"
	role="region"
	aria-label="Markdown preview"
>
	<div class="p-4 {proseClasses}">
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html htmlContent}
	</div>
</div>

<!-- Image Lightbox Modal -->
<ImageLightbox
	src={$imageLightbox.src}
	alt={$imageLightbox.alt}
	open={$imageLightbox.open}
	onClose={imageLightboxActions.close}
/>

<style>
	.markdown-preview {
		/* Custom scrollbar for preview */
		scrollbar-width: thin;
		scrollbar-color: rgba(156, 163, 175, 0.5) transparent;
	}

	.markdown-preview::-webkit-scrollbar {
		width: 6px;
	}

	.markdown-preview::-webkit-scrollbar-track {
		background: transparent;
	}

	.markdown-preview::-webkit-scrollbar-thumb {
		background-color: rgba(156, 163, 175, 0.5);
		border-radius: 3px;
	}

	.markdown-preview::-webkit-scrollbar-thumb:hover {
		background-color: rgba(156, 163, 175, 0.7);
	}

	/* Ensure tables are responsive */
	:global(.markdown-preview table) {
		display: block;
		overflow-x: auto;
		white-space: nowrap;
	}

	/* Improve code block styling */
	:global(.markdown-preview pre) {
		overflow-x: auto;
		border-radius: 0.375rem;
	}

	/* Improve blockquote styling */
	:global(.markdown-preview blockquote) {
		border-left: 4px solid;
		padding-left: 1rem;
		margin: 1rem 0;
	}

	/* Task list styling */
	:global(.markdown-preview ul li input[type='checkbox']) {
		margin-right: 0.5rem;
	}
</style>
