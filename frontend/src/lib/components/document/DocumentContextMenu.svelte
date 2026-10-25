<script lang="ts">
	import { Download, Edit, Trash2 } from '@lucide/svelte';
	import type { Document } from '$lib/api/types.js';
	import ContextMenu from '../context-menu/ContextMenu.svelte';
	import ContextMenuItem from '../context-menu/ContextMenuItem.svelte';

	interface Props {
		document: Document | null;
		position: { x: number; y: number };
		isOpen: boolean;
		onClose: () => void;
		onRename: (document: Document) => void;
		onDelete: (document: Document) => void;
		onExport?: (document: Document) => void;
	}

	let { document, position, isOpen, onClose, onRename, onDelete, onExport }: Props = $props();

	function select(action: ((document: Document) => void) | undefined) {
		if (document && action) {
			action(document);
		}
		onClose();
	}
</script>

{#if isOpen && document}
	<ContextMenu {position} {onClose} class="min-w-[140px]" aria-label="Document actions">
		{#if onExport}
			<ContextMenuItem icon={Download} label="Export" onclick={() => select(onExport)} />
		{/if}
		<ContextMenuItem icon={Edit} label="Rename" onclick={() => select(onRename)} />
		<ContextMenuItem icon={Trash2} label="Delete" destructive onclick={() => select(onDelete)} />
	</ContextMenu>
{/if}
