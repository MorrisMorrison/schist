<script lang="ts">
	import type { ResizeHandleProps } from '$lib/types/editor';

	let { onResizeStart }: ResizeHandleProps = $props();
</script>

<div
	class="border-primary bg-muted hover:bg-accent flex h-4 cursor-ns-resize items-center justify-center border-t transition-colors"
	onmousedown={onResizeStart}
	role="button"
	tabindex="0"
	aria-label="Resize editor height"
>
	<div class="h-1 w-8 rounded-full bg-gray-400"></div>
</div>
