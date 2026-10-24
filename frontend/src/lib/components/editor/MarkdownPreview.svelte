<script lang="ts">
	import type { PreviewProps } from '$lib/types/editor';
	import MarkdownRenderer from '../markdown/MarkdownRenderer.svelte';
	import ImageLightbox from '../ImageLightbox.svelte';
	import { imageLightbox, imageLightboxActions } from '$lib/stores/image-lightbox.svelte';
	import { initializeMarkdownInteractions } from '$lib/utils/markdown-blocks';
	import {
		secretStore,
		replaceSecretPlaceholders,
		markLockedSecretPlaceholders
	} from '$lib/stores/secrets.svelte';

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

	$effect(() => {
		const updateContent = async () => {
			try {
				if (secretStore.secretsUnlocked && content) {
					processedContent = await replaceSecretPlaceholders(content, async (key: string) => {
						return await secretStore.getSecret(key);
					});
				} else if (content) {
					processedContent = markLockedSecretPlaceholders(content);
				} else {
					processedContent = '';
				}

				if (containerRef) {
					setTimeout(() => {
						initializeMarkdownInteractions(containerRef);
					}, 10);
				}
			} catch (error) {
				console.error('Markdown processing error:', error);
				processedContent = 'Error processing markdown content';
			}
		};
		updateContent();
	});

	const themeClasses = $derived(
		theme === 'dark' ? 'bg-background text-foreground dark' : 'bg-background text-foreground'
	);
</script>

<div
	bind:this={containerRef}
	class="markdown-preview h-full overflow-auto border-l {themeClasses} {className}"
	role="region"
	aria-label="Markdown preview"
	onscroll={handleScroll}
	data-testid="markdown-preview"
>
	<div class="p-4">
		<MarkdownRenderer content={processedContent} />
	</div>
</div>

<ImageLightbox
	src={imageLightbox.src}
	alt={imageLightbox.alt}
	open={imageLightbox.open}
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

	/* Task list containers in preview should not have default list padding */
	:global(.markdown-preview ul:not(:has(li:not(.list-none)))) {
		list-style: none;
		padding-left: 0;
	}
</style>
