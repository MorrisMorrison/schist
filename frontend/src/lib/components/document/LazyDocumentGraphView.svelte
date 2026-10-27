<script lang="ts">
	import { onMount } from 'svelte';
	import LoadingSpinner from '#lib/components/LoadingSpinner.svelte';
	import type { Document, WikiLink } from '#lib/api/types.ts';

	interface Props {
		currentDocument: Document;
		backlinks: Document[];
		outgoingLinks: WikiLink[];
	}

	const { currentDocument, backlinks, outgoingLinks }: Props = $props();

	let GraphComponent = $state<typeof import('./DocumentGraphView.svelte').default | null>(null);
	let isLoading = $state(true);
	let loadError = $state<string | null>(null);

	onMount(async () => {
		try {
			// Dynamically import the full DocumentGraphView component on mount
			const graphModule = await import('./DocumentGraphView.svelte');
			GraphComponent = graphModule.default;
		} catch (error) {
			console.error('Failed to load graph visualization:', error);
			loadError = 'Failed to load graph visualization.';
		} finally {
			isLoading = false;
		}
	});
</script>

{#if isLoading}
	<div class="flex items-center justify-center py-8">
		<div class="flex items-center gap-2">
			<LoadingSpinner size="sm" />
			<span class="text-muted-foreground text-sm">Loading graph...</span>
		</div>
	</div>
{:else if loadError}
	<div class="text-destructive flex items-center justify-center py-8 text-sm">
		{loadError}
	</div>
{:else if GraphComponent}
	<GraphComponent {currentDocument} {backlinks} {outgoingLinks} />
{/if}
