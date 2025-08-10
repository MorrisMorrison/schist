<script lang="ts">
	import type { PreviewProps } from '$lib/types/editor';
	import MarkdownRenderer from '../markdown/MarkdownRenderer.svelte';
	import ImageLightbox from '../ImageLightbox.svelte';
	import { imageLightbox, imageLightboxActions } from '$lib/stores/image-lightbox';
	import {
		secretStore,
		secretsUnlocked,
		replaceSecretPlaceholders,
		parseSecretPlaceholders
	} from '$lib/stores/secrets';

	let {
		content,
		theme = 'light',
		className = '',
		container = $bindable(),
		onScroll
	}: PreviewProps = $props();

	let containerRef: HTMLDivElement;

	function handleScroll() {
		if (onScroll) {
			onScroll();
		}
	}

	$effect(() => {
		container = containerRef;
	});

	let processedContent = $state('');

	// Helper function for adding secret placeholder indicators
	function addSecretPlaceholderIndicators(text: string): string {
		const placeholders = parseSecretPlaceholders(text);

		let processedText = text;
		for (const { placeholder, key } of placeholders) {
			const indicator = `<span class="secret-placeholder bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200 px-2 py-1 rounded-md font-mono text-sm border border-amber-200 dark:border-amber-700" title="Secret '${key}' is locked. Unlock secrets to view the value.">${placeholder} 🔒</span>`;
			processedText = processedText.replace(placeholder, indicator);
		}

		return processedText;
	}

	$effect(() => {
		const updateContent = async () => {
			try {
				// Process secret placeholders
				if ($secretsUnlocked && content) {
					// Replace placeholders with actual values when unlocked
					processedContent = await replaceSecretPlaceholders(content, async (key: string) => {
						return await secretStore.getSecret(key);
					});
				} else if (content) {
					// Add visual indicators for locked placeholders
					processedContent = addSecretPlaceholderIndicators(content);
				} else {
					processedContent = '';
				}
			} catch (error) {
				console.error('Markdown processing error:', error);
				processedContent = 'Error processing markdown content';
			}
		};
		updateContent();
	});

	const themeClasses = $derived(
		theme === 'dark' ? 'bg-gray-900 text-gray-100 dark' : 'bg-white text-gray-900'
	);
</script>

<div
	bind:this={containerRef}
	class="markdown-preview h-full overflow-auto border-l {themeClasses} {className}"
	role="region"
	aria-label="Markdown preview"
	onscroll={handleScroll}
>
	<div class="p-4">
		<MarkdownRenderer content={processedContent} />
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

	:global(.markdown-preview table) {
		display: block;
		overflow-x: auto;
		white-space: nowrap;
	}

	:global(.markdown-preview pre) {
		overflow-x: auto;
		border-radius: 0.375rem;
	}

	:global(.markdown-preview blockquote) {
		border-left: 4px solid;
		padding-left: 1rem;
		margin: 1rem 0;
	}

	:global(.markdown-preview ul li input[type='checkbox']) {
		margin-right: 0.5rem;
	}
</style>
