<script lang="ts">
	import { Network } from 'lucide-svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import type { Document, WikiLink } from '$lib/api/types';

	interface Props {
		currentDocument: Document;
		backlinks: Document[];
		outgoingLinks: WikiLink[];
	}

	const { currentDocument, backlinks, outgoingLinks }: Props = $props();

	let GraphComponent = $state<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
	let isLoading = $state(false);
	let isGraphEnabled = $state(false);
	let loadError = $state<string | null>(null);

	async function enableGraph() {
		isLoading = true;
		loadError = null;

		try {
			// Dynamically import the full DocumentGraphView component
			const graphModule = await import('./DocumentGraphView.svelte');
			GraphComponent = graphModule.default;
			isGraphEnabled = true;
		} catch (error) {
			console.error('Failed to load graph visualization:', error);
			loadError = 'Failed to load graph visualization. Please try again.';
		} finally {
			isLoading = false;
		}
	}

	function disableGraph() {
		isGraphEnabled = false;
		GraphComponent = null;
	}
</script>

<div class="bg-muted/50 border-t p-4">
	{#if !isGraphEnabled}
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-2">
				<Network class="text-muted-foreground h-4 w-4" />
				<span class="text-muted-foreground text-sm">Document Graph</span>
			</div>

			{#if !isLoading}
				<button class="text-primary text-sm hover:underline" onclick={enableGraph}>
					Show Graph
				</button>
			{:else}
				<div class="flex items-center gap-2">
					<LoadingSpinner size="sm" />
					<span class="text-muted-foreground text-sm">Loading...</span>
				</div>
			{/if}
		</div>

		{#if loadError}
			<div class="text-destructive mt-2 text-sm">
				{loadError}
				<button class="text-primary ml-2 hover:underline" onclick={enableGraph}> Retry </button>
			</div>
		{/if}
	{:else if GraphComponent}
		<div class="space-y-2">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-2">
					<Network class="text-muted-foreground h-4 w-4" />
					<span class="text-muted-foreground text-sm">Document Graph</span>
				</div>
				<button class="text-muted-foreground hover:text-foreground text-sm" onclick={disableGraph}>
					Hide Graph
				</button>
			</div>

			<div class="bg-background rounded-md border">
				<GraphComponent {currentDocument} {backlinks} {outgoingLinks} />
			</div>
		</div>
	{/if}
</div>
