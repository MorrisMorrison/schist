<script lang="ts">
	import { ResizeHandle } from '#lib/components/ui/resizable/index.ts';
	import { SIDEBAR_WIDTH, sidebar, sidebarActions } from '#lib/stores/sidebar.svelte.ts';

	interface Props {
		/** True while a drag runs, so the layout can pause its width transition. */
		ondragchange?: (dragging: boolean) => void;
		class?: string;
	}

	let { ondragchange, class: className }: Props = $props();
</script>

<ResizeHandle
	value={sidebar.width}
	min={SIDEBAR_WIDTH.min}
	max={SIDEBAR_WIDTH.max}
	defaultValue={SIDEBAR_WIDTH.default}
	label="Resize sidebar"
	onResize={sidebarActions.setWidth}
	onResizeStart={() => ondragchange?.(true)}
	onResizeEnd={() => ondragchange?.(false)}
	class={className}
	data-testid="sidebar-resize-handle"
/>
