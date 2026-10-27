<script lang="ts">
	import { File } from '@lucide/svelte';
	import { cn } from '#lib/utils.ts';
	import TreeRowMenuTrigger from '../folder/TreeRowMenuTrigger.svelte';
	import type { Document } from '#lib/api/types.ts';
	import type { DragAndDrop } from '#lib/composables/useDragAndDrop.svelte.ts';

	interface Props {
		document: Document;
		depth: number;
		isSelected: boolean;
		isCurrent: boolean;
		enableContextMenu: boolean;
		dnd: DragAndDrop;
		/** The folder the document is in: dropping on the document moves into it. */
		folderPath: string;
		onSelect: () => void;
		onContextMenu: (event: MouseEvent | KeyboardEvent) => void;
	}

	let {
		document,
		depth,
		isSelected,
		isCurrent,
		enableContextMenu,
		dnd,
		folderPath,
		onSelect,
		onContextMenu
	}: Props = $props();

	const isBeingDragged = $derived(
		dnd.isDragging && dnd.draggedItem?.path === document.metaData.path
	);
	const isDropTarget = $derived(dnd.dropTarget === document.metaData.path);
	const isDragOver = $derived(dnd.dragOverTarget === document.metaData.path);
</script>

<div
	class={cn(
		'group relative flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
		'hover:bg-accent hover:text-accent-foreground',
		isSelected && 'bg-accent text-accent-foreground',
		isCurrent && 'bg-accent font-medium',
		isBeingDragged && 'opacity-50',
		isDropTarget && 'bg-primary/10 ring-primary ring-2',
		isDragOver && 'bg-primary/20'
	)}
	draggable="true"
	ondragstart={(e) => dnd.handleDragStart(e, 'page', document.metaData.path, document)}
	ondragend={dnd.handleDragEnd}
	ondragover={(e) => dnd.handleDragOver(e, folderPath)}
	ondragenter={(e) => dnd.handleDragEnter(e, folderPath)}
	ondragleave={(e) => dnd.handleDragLeave(e, folderPath)}
	ondrop={(e) => dnd.handleDrop(e, folderPath)}
	oncontextmenu={onContextMenu}
	role="treeitem"
	aria-label={`Document: ${document.metaData?.title || 'Untitled'}`}
	aria-selected={isSelected}
	tabindex="-1"
	data-testid="document-item"
	data-document-path={document.metaData.path}
>
	<div
		class="flex w-full items-center gap-2 pr-8"
		style="--indent-level: {depth + 1}; margin-left: calc(var(--indent-level) * 1rem);"
	>
		<div class="h-4 w-4"></div>
		<button
			type="button"
			class="focus:ring-ring flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-left focus:ring-2 focus:ring-offset-1 focus:outline-none"
			onclick={onSelect}
			data-testid="document-name-button"
		>
			<File class="text-muted-foreground h-4 w-4 flex-shrink-0" />
			<span class="truncate text-left" title={document.metaData?.title || 'Untitled'}
				>{document.metaData?.title || 'Untitled'}</span
			>
		</button>
	</div>

	{#if enableContextMenu}
		<TreeRowMenuTrigger label="Document options" onOpen={onContextMenu} />
	{/if}
</div>
