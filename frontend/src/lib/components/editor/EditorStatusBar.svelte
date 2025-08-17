<script lang="ts">
	interface EditorStatusBarProps {
		content: string;
		theme: 'light' | 'dark';
		autoSaveEnabled: boolean;
		isFullscreen: boolean;
	}

	let {
		content = '',
		theme = 'light',
		autoSaveEnabled = true,
		isFullscreen = false
	}: EditorStatusBarProps = $props();

	const wordCount = $derived(content.split(/\s+/).filter((w) => w.length > 0).length);
	const charCount = $derived(content.length);
	const lineCount = $derived(content.split('\n').length);
</script>

<div
	class="border-primary bg-background text-muted-foreground flex items-center justify-between border-t px-4 py-2 text-xs"
>
	<div class="flex items-center gap-4">
		<span>Words: {wordCount}</span>
		<span>Characters: {charCount}</span>
		<span>Lines: {lineCount}</span>
	</div>
	<div class="flex items-center gap-2">
		{#if autoSaveEnabled}
			<span>Auto-save enabled</span>
		{/if}
		<span>Theme: {theme}</span>
		{#if isFullscreen}
			<span>Fullscreen Mode</span>
		{/if}
	</div>
</div>