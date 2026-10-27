<script lang="ts">
	import type { ParagraphBlock } from '#lib/utils/markdown-blocks.ts';
	import { sanitizeHtml } from '#lib/utils/sanitizer.ts';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { imageLightboxActions } from '#lib/stores/image-lightbox.svelte.ts';

	let { block }: { block: ParagraphBlock } = $props();
	let container: HTMLElement;

	function handleClick(event: Event) {
		const target = event.target as HTMLElement;

		// Handle wiki links
		if (target.classList.contains('wiki-link')) {
			if (target.classList.contains('broken-link')) {
				event.preventDefault();
				return;
			}

			event.preventDefault();
			const wikiTarget = target.getAttribute('data-wiki-target');
			if (wikiTarget) {
				goto(`/documents${wikiTarget}`);
			}
			return;
		}

		// Handle inline images
		if (target.tagName === 'IMG') {
			event.preventDefault();
			const img = target as HTMLImageElement;

			// Use the actual src from the img element (already transformed by the renderer)
			const src = img.src;
			const alt = img.alt || '';

			imageLightboxActions.open(src, alt);
		}
	}

	onMount(() => {
		if (container) {
			container.addEventListener('click', handleClick);

			// Add cursor pointer to images
			const images = container.querySelectorAll('img');
			images.forEach((img) => {
				img.classList.add('cursor-pointer', 'transition-opacity', 'hover:opacity-90');
			});

			return () => {
				container.removeEventListener('click', handleClick);
			};
		}
	});
</script>

<p bind:this={container} class="mb-4 leading-relaxed">{@html sanitizeHtml(block.text)}</p>
