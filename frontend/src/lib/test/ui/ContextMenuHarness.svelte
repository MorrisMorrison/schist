<script lang="ts">
	// ui/context-menu for the library's component tests: a right-click area, or a
	// menu opened in code at a given position.
	import * as ContextMenu from '$lib/components/ui/context-menu';

	interface Props {
		position?: { x: number; y: number };
		open?: boolean;
		onAction?: (action: string) => void;
		onOpenChange?: (open: boolean) => void;
	}

	let { position, open = $bindable(false), onAction, onOpenChange }: Props = $props();
</script>

<ContextMenu.Root bind:open {onOpenChange}>
	{#if !position}
		<ContextMenu.Trigger data-testid="area" class="block h-40 w-80"
			>Right-click here</ContextMenu.Trigger
		>
	{/if}
	<ContextMenu.Content {position} aria-label="Actions" data-testid="menu">
		<ContextMenu.Group>
			<ContextMenu.Label>File</ContextMenu.Label>
			<ContextMenu.Item onSelect={() => onAction?.('open')}>Open</ContextMenu.Item>
			<ContextMenu.Item inset onSelect={() => onAction?.('rename')}>Rename</ContextMenu.Item>
			<ContextMenu.Item disabled onSelect={() => onAction?.('share')}>Share</ContextMenu.Item>
		</ContextMenu.Group>
		<ContextMenu.Separator />
		<ContextMenu.Item variant="destructive" onSelect={() => onAction?.('delete')}>
			Delete
		</ContextMenu.Item>
	</ContextMenu.Content>
</ContextMenu.Root>
