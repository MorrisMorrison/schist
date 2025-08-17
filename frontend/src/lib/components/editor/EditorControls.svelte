<script lang="ts">
	interface EditorControlsProps {
		isFullscreen: boolean;
		isDirty: boolean;
		lastSaved: Date | null;
		isPreviewVisible: boolean;
		onTogglePreview: () => void;
	}

	let {
		isFullscreen = false,
		isDirty = false,
		lastSaved = null,
		isPreviewVisible = true,
		onTogglePreview
	}: EditorControlsProps = $props();
</script>

<div
	class="border-primary bg-background flex min-h-[3rem] items-center justify-between border-b px-4 py-2"
>
	<div class="flex items-center gap-4">
		<span class="text-sm font-medium">{isFullscreen ? 'Fullscreen Editor' : 'Editor'}</span>
		{#if isDirty}
			<span
				class="bg-muted text-muted-foreground rounded px-2 py-1 text-xs"
				data-testid="unsaved-indicator"
			>
				Unsaved changes
			</span>
		{/if}
		{#if lastSaved}
			<span class="text-muted-foreground text-xs" data-testid="auto-saved">
				Saved {lastSaved.toLocaleTimeString()}
			</span>
		{/if}
	</div>
	<div class="flex items-center gap-2">
		<button
			class="border-secondary text-foreground hover:bg-accent rounded border px-3 py-1 text-sm transition-colors"
			onclick={onTogglePreview}
		>
			{isPreviewVisible ? 'Hide Preview' : 'Show Preview'}
		</button>
		{#if isFullscreen}
			<span class="text-muted-foreground text-xs">Press F11 or Escape to exit</span>
		{/if}
	</div>
</div>