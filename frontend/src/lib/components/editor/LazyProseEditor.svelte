<script lang="ts">
	// Loads ProseEditor (and with it CodeMirror) on first use, so reading a
	// document never downloads the editor.
	import { onMount } from 'svelte';
	import LoadingSpinner from '#lib/components/LoadingSpinner.svelte';
	import { Button } from '#lib/components/ui/button/index.ts';
	import type { FormattingType, ProseEditorProps } from '#lib/types/editor.ts';
	import type ProseEditorComponent from './ProseEditor.svelte';

	const props: ProseEditorProps = $props();

	let EditorComponent = $state<typeof ProseEditorComponent | null>(null);
	let loadError = $state<string | null>(null);
	let editor = $state<ProseEditorComponent>();

	onMount(async () => {
		try {
			EditorComponent = (await import('./ProseEditor.svelte')).default;
		} catch (error) {
			console.error('Failed to load editor:', error);
			loadError = 'Failed to load editor. Please refresh the page.';
		}
	});

	export function formatText(type: FormattingType, value?: string) {
		editor?.formatText(type, value);
	}

	export function setContent(content: string) {
		editor?.setContent(content);
	}

	export function focus() {
		editor?.focus();
	}

	export function remeasure() {
		editor?.remeasure();
	}
</script>

{#if loadError}
	<div class="py-12 text-center">
		<p class="text-destructive">{loadError}</p>
		<Button variant="link" size="sm" class="mt-2" onclick={() => window.location.reload()}>
			Retry
		</Button>
	</div>
{:else if EditorComponent}
	<EditorComponent bind:this={editor} {...props} />
{:else}
	<div class="flex items-center gap-3 py-12" data-testid="editor-loading">
		<LoadingSpinner />
		<p class="text-muted-foreground text-sm">Loading editor...</p>
	</div>
{/if}
