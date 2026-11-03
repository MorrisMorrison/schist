<script lang="ts">
	import { Download, Edit, Trash2 } from '@lucide/svelte';
	import type { DocumentSummary } from '#lib/api/types.ts';
	import * as ContextMenu from '#lib/components/ui/context-menu/index.ts';

	interface Props {
		document: DocumentSummary | null;
		position: { x: number; y: number };
		isOpen: boolean;
		onClose: () => void;
		onRename: (document: DocumentSummary) => void;
		onDelete: (document: DocumentSummary) => void;
		onExport?: (document: DocumentSummary) => void;
	}

	let { document, position, isOpen, onClose, onRename, onDelete, onExport }: Props = $props();

	// Choosing an item also closes the menu (through onOpenChange).
	function select(action: ((document: DocumentSummary) => void) | undefined) {
		if (document && action) {
			action(document);
		}
	}
</script>

{#if isOpen && document}
	<ContextMenu.Root open onOpenChange={(open) => !open && onClose()}>
		<!-- No scroll lock: a right-click on another row moves the menu there. -->
		<ContextMenu.Content
			{position}
			preventScroll={false}
			class="min-w-[140px]"
			aria-label="Document actions"
			data-testid="document-context-menu"
		>
			{#if onExport}
				<ContextMenu.Item onSelect={() => select(onExport)}>
					<Download />
					Export
				</ContextMenu.Item>
			{/if}
			<ContextMenu.Item onSelect={() => select(onRename)}>
				<Edit />
				Rename
			</ContextMenu.Item>
			<ContextMenu.Separator />
			<ContextMenu.Item variant="destructive" onSelect={() => select(onDelete)}>
				<Trash2 />
				Delete
			</ContextMenu.Item>
		</ContextMenu.Content>
	</ContextMenu.Root>
{/if}
