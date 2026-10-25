<script lang="ts">
	// Lightweight stand-in for LazyEditor (CodeMirror) in component tests.
	import type { EditorProps } from '$lib/types/editor';

	let { initialContent = '', onContentChange }: Omit<EditorProps, 'theme'> = $props();
</script>

<textarea
	data-testid="editor-stub"
	value={initialContent}
	oninput={(e) => onContentChange?.(e.currentTarget.value)}></textarea>
