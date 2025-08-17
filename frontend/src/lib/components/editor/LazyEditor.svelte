<script lang="ts">
	import { onMount } from 'svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import type { EditorProps } from '$lib/types/editor';

	const props: Omit<EditorProps, 'theme'> = $props();

	let EditorComponent = $state<typeof import('./Editor.svelte').default | null>(null);
	let isLoading = $state(true);
	let loadError = $state<string | null>(null);
	let editorInstance = $state<{ setContentImmediate: (content: string) => void } | null>(null);

	// Export the setContentImmediate method to forward to the actual editor
	export function setContentImmediate(content: string) {
		if (editorInstance && editorInstance.setContentImmediate) {
			editorInstance.setContentImmediate(content);
		}
	}

	onMount(async () => {
		try {
			// Dynamically import the full Editor component
			const editorModule = await import('./Editor.svelte');
			EditorComponent = editorModule.default;
		} catch (error) {
			console.error('Failed to load editor:', error);
			loadError = 'Failed to load editor. Please refresh the page.';
		} finally {
			isLoading = false;
		}
	});
</script>

{#if isLoading}
	<div class="flex h-96 items-center justify-center">
		<div class="flex flex-col items-center gap-4">
			<LoadingSpinner />
			<p class="text-muted-foreground text-sm">Loading editor...</p>
		</div>
	</div>
{:else if loadError}
	<div class="flex h-96 items-center justify-center">
		<div class="text-center">
			<p class="text-destructive">{loadError}</p>
			<button
				class="text-primary mt-2 text-sm hover:underline"
				onclick={() => window.location.reload()}
			>
				Retry
			</button>
		</div>
	</div>
{:else if EditorComponent}
	<EditorComponent {...props} bind:this={editorInstance} />
{/if}
