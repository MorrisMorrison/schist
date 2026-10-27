<script lang="ts">
	import { ContextMenu as ContextMenuPrimitive } from 'bits-ui';
	import { cn } from '#lib/utils.ts';

	let {
		ref = $bindable(null),
		portalProps,
		position,
		customAnchor,
		class: className,
		...restProps
	}: ContextMenuPrimitive.ContentProps & {
		portalProps?: ContextMenuPrimitive.PortalProps;
		/**
		 * Opens the menu at this viewport point (e.g. a pointer position) instead of
		 * where a ContextMenu.Trigger was right-clicked; for menus opened in code.
		 */
		position?: { x: number; y: number };
	} = $props();

	const pointAnchor = $derived(
		position && {
			getBoundingClientRect: () =>
				DOMRect.fromRect({ x: position.x, y: position.y, width: 0, height: 0 })
		}
	);
</script>

<ContextMenuPrimitive.Portal {...portalProps}>
	<ContextMenuPrimitive.Content
		bind:ref
		data-slot="context-menu-content"
		customAnchor={pointAnchor || customAnchor}
		class={cn(
			'bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 z-50 max-h-(--bits-context-menu-content-available-height) min-w-[10rem] origin-(--bits-context-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border p-1 shadow-md outline-none',
			className
		)}
		{...restProps}
	/>
</ContextMenuPrimitive.Portal>
