<script lang="ts">
	import { onMount } from 'svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';

	interface Props {
		content: string;
	}

	const { content }: Props = $props();

	let MarkdownRendererComponent = $state<typeof import('./MarkdownRenderer.svelte').default | null>(null);
	let isLoading = $state(true);
	let loadError = $state<string | null>(null);

	onMount(async () => {
		try {
			// Dynamically import the MarkdownRenderer component
			const rendererModule = await import('./MarkdownRenderer.svelte');
			MarkdownRendererComponent = rendererModule.default;
		} catch (error) {
			console.error('Failed to load markdown renderer:', error);
			loadError = 'Failed to load content renderer. Please refresh the page.';
		} finally {
			isLoading = false;
		}
	});
</script>

{#if isLoading}
	<div class="flex items-center justify-center py-8">
		<div class="flex items-center gap-2">
			<LoadingSpinner size="sm" />
			<span class="text-muted-foreground text-sm">Loading content...</span>
		</div>
	</div>
{:else if loadError}
	<div class="text-destructive flex items-center justify-center py-8 text-sm">
		{loadError}
	</div>
{:else if MarkdownRendererComponent}
	<MarkdownRendererComponent {content} />
{/if}