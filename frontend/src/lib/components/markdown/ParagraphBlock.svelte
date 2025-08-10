<script lang="ts">
	import type { ParagraphBlock } from '$lib/utils/markdown-blocks';
	import { sanitizeHtml } from '$lib/utils/sanitizer';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	let { block }: { block: ParagraphBlock } = $props();
	let container: HTMLElement;

	// Handle wiki link clicks
	function handleWikiLinkClick(event: Event) {
		const target = event.target as HTMLElement;
		if (target.classList.contains('wiki-link')) {
			event.preventDefault();
			const wikiTarget = target.getAttribute('data-wiki-target');
			if (wikiTarget) {
				const isBrokenLink = target.classList.contains('broken-link');
				if (isBrokenLink) {
					goto(`/edit${wikiTarget}`);
				} else {
					goto(`/documents${wikiTarget}`);
				}
			}
		}
	}

	onMount(() => {
		if (container) {
			container.addEventListener('click', handleWikiLinkClick);
			return () => {
				container.removeEventListener('click', handleWikiLinkClick);
			};
		}
	});
</script>

<p bind:this={container} class="mb-4 leading-relaxed">{@html sanitizeHtml(block.text)}</p>
