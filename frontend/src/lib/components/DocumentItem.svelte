<script lang="ts">
	import { File, MoreVertical } from 'lucide-svelte';
	import { cn } from '$lib/utils.js';
	import type { Document, Folder as FolderType } from '$lib/api/types.js';

	interface Props {
		document: Document;
		depth: number;
		isSelected: boolean;
		isCurrent: boolean;
		enableContextMenu: boolean;
		isDragging: boolean;
		draggedItem: { type: 'folder' | 'page'; path: string; data: FolderType | Document } | null;
		dropTarget: string | null;
		dragOverTarget: string | null;
		onSelect: () => void;
		onContextMenu: (event: MouseEvent | KeyboardEvent) => void;
		onDragStart: (event: DragEvent, type: 'folder' | 'page', path: string, data: Document) => void;
		onDragEnd: () => void;
		onDragOver: (event: DragEvent) => void;
		onDragEnter: (event: DragEvent) => void;
		onDragLeave: (event: DragEvent) => void;
		onDrop: (event: DragEvent) => void;
	}

	let {
		document,
		depth,
		isSelected,
		isCurrent,
		enableContextMenu,
		isDragging,
		draggedItem,
		dropTarget,
		dragOverTarget,
		onSelect,
		onContextMenu,
		onDragStart,
		onDragEnd,
		onDragOver,
		onDragEnter,
		onDragLeave,
		onDrop
	}: Props = $props();

	const isBeingDragged = $derived(isDragging && draggedItem?.path === document.metaData.path);
	const isDropTarget = $derived(dropTarget === document.metaData.path);
	const isDragOver = $derived(dragOverTarget === document.metaData.path);
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
	ondragstart={(e) => onDragStart(e, 'page', document.metaData.path, document)}
	ondragend={onDragEnd}
	ondragover={onDragOver}
	ondragenter={onDragEnter}
	ondragleave={onDragLeave}
	ondrop={onDrop}
	oncontextmenu={onContextMenu}
	role="treeitem"
	aria-label={`Document: ${document.metaData?.title || 'Untitled'}`}
	aria-selected={isSelected}
	tabindex="-1"
	data-testid="document-item"
>
	<!-- Indented content container -->
	<div class="flex w-full items-center gap-2 pr-8" style="margin-left: {(depth + 1) * 16}px">
		<div class="h-4 w-4"></div>
		<button
			type="button"
			class="focus:ring-ring flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-left focus:ring-2 focus:ring-offset-1 focus:outline-none"
			onclick={onSelect}
			data-testid="document-name-button"
		>
			<File class="text-blue-primary h-4 w-4 flex-shrink-0" />
			<span class="truncate text-left" title={document.metaData?.title || 'Untitled'}
				>{document.metaData?.title || 'Untitled'}</span
			>
		</button>
	</div>

	<!-- Document Context Menu Trigger - Positioned absolutely to the right -->
	{#if enableContextMenu}
		<span
			class="hover:bg-accent absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer rounded p-1 opacity-0 group-hover:opacity-100"
			onclick={(e) => {
				e.stopPropagation();
				onContextMenu(e);
			}}
			onkeydown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					e.stopPropagation();
					onContextMenu(e);
				}
			}}
			role="button"
			tabindex="0"
			aria-label="Document options"
		>
			<MoreVertical class="h-3 w-3" />
		</span>
	{/if}
</div>
