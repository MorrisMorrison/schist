<script lang="ts">
	// The area that opens the menu at the pointer on right-click (or long-press on touch).
	import { ContextMenu as ContextMenuPrimitive } from 'bits-ui';

	let { ref = $bindable(null), ...restProps }: ContextMenuPrimitive.TriggerProps = $props();
</script>

<ContextMenuPrimitive.Trigger bind:ref data-slot="context-menu-trigger" {...restProps} />
