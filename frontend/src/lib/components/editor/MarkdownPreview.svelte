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

	// The rendered draft on the new-document page (reading view styling, same
	// secret and sanitising path as the document view).
	let { content, className = '' }: PreviewProps = $props();

	let containerRef: HTMLDivElement;

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
</script>

<div
	bind:this={containerRef}
	class="markdown-preview reading {className}"
	role="region"
	aria-label="Markdown preview"
	data-testid="markdown-preview"
>
	<MarkdownRenderer content={processedContent} />
</div>

<ImageLightbox
	src={imageLightbox.src}
	alt={imageLightbox.alt}
	open={imageLightbox.open}
	onClose={imageLightboxActions.close}
/>

<style>
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
