<script lang="ts">
	import { ChevronRight, ChevronDown, Folder, MoreVertical } from 'lucide-svelte';
	import { cn } from '$lib/utils.js';
	import type { Folder as FolderType, Document } from '$lib/api/types.js';
	import DocumentItem from '../document/DocumentItem.svelte';
	import FolderTreeNode from './FolderTreeNode.svelte';

	interface Props {
		folder: FolderType;
		depth: number;
		maxDepth: number;
		isExpanded: boolean;
		isSelected: boolean;
		isCurrent: boolean;
		showPages: boolean;
		showPageCounts: boolean;
		enableContextMenu: boolean;
		filteredPages: Document[];
		selectedPath: string;
		currentPath: string;
		isDragging: boolean;
		draggedItem: { type: 'folder' | 'page'; path: string; data: FolderType | Document } | null;
		dropTarget: string | null;
		dragOverTarget: string | null;
		expandedFolders: Set<string>;
		onToggleExpanded: (path: string) => void;
		onFolderSelect: (folder: FolderType) => void;
		onContextMenu: (event: MouseEvent | KeyboardEvent, folder: FolderType) => void;
		onDragStart: (
			event: DragEvent,
			type: 'folder' | 'page',
			path: string,
			data: FolderType | Document
		) => void;
		onDragEnd: () => void;
		onDragOver: (event: DragEvent, targetPath: string) => void;
		onDragEnter: (event: DragEvent, targetPath: string) => void;
		onDragLeave: (event: DragEvent, targetPath: string) => void;
		onDrop: (event: DragEvent, targetPath: string) => void;
		onDocumentSelect?: (event: { document: Document }) => void;
		onDocumentContextMenu?: (event: MouseEvent | KeyboardEvent, document: Document) => void;
		getFilteredPagesForFolder: (folderPath: string) => Document[];
	}

	let {
		folder,
		depth,
		maxDepth,
		isExpanded,
		isSelected,
		isCurrent,
		showPages,
		showPageCounts,
		enableContextMenu,
		filteredPages,
		selectedPath,
		currentPath,
		isDragging,
		draggedItem,
		dropTarget,
		dragOverTarget,
		expandedFolders,
		onToggleExpanded,
		onFolderSelect,
		onContextMenu,
		onDragStart,
		onDragEnd,
		onDragOver,
		onDragEnter,
		onDragLeave,
		onDrop,
		onDocumentSelect,
		onDocumentContextMenu,
		getFilteredPagesForFolder
	}: Props = $props();

	const hasSubFolders = $derived(folder.sub_folders && folder.sub_folders.length > 0);
	const hasPages = $derived(showPages && filteredPages.length > 0);
	const hasExpandableContent = $derived(hasSubFolders || hasPages);
	const indentLevel = $derived(Math.min(depth, maxDepth));
	const isBeingDragged = $derived(isDragging && draggedItem?.path === folder.path);
	const isDropTarget = $derived(dropTarget === folder.path);
	const isDragOver = $derived(dragOverTarget === folder.path);

	function handleChevronClick(event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();
		onToggleExpanded(folder.path);
	}

	function handleFolderNameClick() {
		onFolderSelect(folder);
	}

	function handleKeydown(event: KeyboardEvent) {
		switch (event.key) {
			case 'Enter':
			case ' ':
				event.preventDefault();
				handleFolderNameClick();
				break;
			case 'ArrowRight':
				event.preventDefault();
				if (!isExpanded && hasExpandableContent) {
					onToggleExpanded(folder.path);
				}
				break;
			case 'ArrowLeft':
				event.preventDefault();
				if (isExpanded) {
					onToggleExpanded(folder.path);
				}
				break;
		}
	}

	function isCurrentFile(path: string): boolean {
		return `/documents${path}` === currentPath;
	}

	function isSelectedFile(path: string): boolean {
		return `/documents${path}` === currentPath;
	}

	function isCurrentPath(folderPath: string): boolean {
		if (folderPath === '/') {
			return currentPath === folderPath || currentPath === '/folders';
		}
		return currentPath === `/folders${folderPath}` || currentPath === `/folders${folderPath}/`;
	}
</script>

<div class="relative">
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
		ondragstart={(e) => onDragStart(e, 'folder', folder.path, folder)}
		ondragend={onDragEnd}
		ondragover={(e) => onDragOver(e, folder.path)}
		ondragenter={(e) => onDragEnter(e, folder.path)}
		ondragleave={(e) => onDragLeave(e, folder.path)}
		ondrop={(e) => onDrop(e, folder.path)}
		oncontextmenu={(e) => onContextMenu(e, folder)}
		role="treeitem"
		aria-expanded={hasExpandableContent ? isExpanded : undefined}
		aria-selected={isSelected}
		aria-level={depth + 1}
		tabindex="-1"
		data-testid="folder-tree-item"
	>
		<div
			class="flex w-full items-center gap-2 pr-8"
			style="--indent-level: {indentLevel}; margin-left: calc(var(--indent-level) * 1rem);"
		>
			<button
				type="button"
				class="flex h-4 w-4 flex-shrink-0 cursor-pointer items-center justify-center rounded"
				onclick={handleChevronClick}
				tabindex={hasExpandableContent ? 0 : -1}
				aria-label={isExpanded ? 'Collapse folder' : 'Expand folder'}
				disabled={!hasExpandableContent}
				data-testid="folder-expand-button"
			>
				{#if hasExpandableContent}
					{#if isExpanded}
						<ChevronDown class="h-3 w-3" />
					{:else}
						<ChevronRight class="h-3 w-3" />
					{/if}
				{/if}
			</button>

			<button
				type="button"
				class="focus:ring-ring flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-left focus:ring-2 focus:ring-offset-1 focus:outline-none"
				onclick={handleFolderNameClick}
				onkeydown={handleKeydown}
				tabindex="0"
				aria-label={`Open folder ${folder.name}`}
				data-testid="folder-name-button"
			>
				<Folder class="text-blue-primary h-4 w-4 flex-shrink-0" />

				<span class="truncate font-medium" title={folder.name}>
					{folder.name}
				</span>

				{#if showPageCounts && folder.document_count > 0}
					<span class="text-secondary ml-1 text-xs opacity-75">({folder.document_count})</span>
				{/if}
			</button>
		</div>

		<!-- Context Menu Trigger - Positioned absolutely to the right -->
		{#if enableContextMenu}
			<span
				class="hover:bg-accent absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer rounded p-1 opacity-0 group-hover:opacity-100"
				onclick={(e) => {
					e.stopPropagation();
					onContextMenu(e, folder);
				}}
				onkeydown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						e.stopPropagation();
						onContextMenu(e, folder);
					}
				}}
				role="button"
				tabindex="0"
				aria-label="Folder options"
				data-testid="folder-context-menu-trigger"
			>
				<MoreVertical class="h-3 w-3" />
			</span>
		{/if}
	</div>

	{#if isExpanded}
		<div class="mt-1">
			<!-- Render subfolders first (consistent with file system conventions) -->
			{#if hasSubFolders}
				{#each folder.sub_folders as subFolder (subFolder.path)}
					<FolderTreeNode
						folder={subFolder}
						depth={depth + 1}
						{maxDepth}
						isExpanded={expandedFolders.has(subFolder.path)}
						isSelected={selectedPath === subFolder.path}
						isCurrent={isCurrentPath(subFolder.path)}
						{showPages}
						{showPageCounts}
						{enableContextMenu}
						filteredPages={getFilteredPagesForFolder(subFolder.path)}
						{selectedPath}
						{currentPath}
						{isDragging}
						{draggedItem}
						{dropTarget}
						{dragOverTarget}
						{expandedFolders}
						{onToggleExpanded}
						{onFolderSelect}
						{onContextMenu}
						{onDragStart}
						{onDragEnd}
						{onDragOver}
						{onDragEnter}
						{onDragLeave}
						{onDrop}
						{onDocumentSelect}
						{onDocumentContextMenu}
						{getFilteredPagesForFolder}
					/>
				{/each}
			{/if}

			<!-- Render documents after folders to prevent name collision issues -->
			{#if showPages}
				{#each filteredPages as page (`doc-${page.metaData?.path || page.metaData?.slug}`)}
					<DocumentItem
						document={page}
						{depth}
						{isDragging}
						{draggedItem}
						{dropTarget}
						{dragOverTarget}
						isSelected={isSelectedFile(page.metaData.path)}
						isCurrent={isCurrentFile(page.metaData.path)}
						{enableContextMenu}
						onSelect={() => onDocumentSelect?.({ document: page })}
						onContextMenu={(e) => onDocumentContextMenu?.(e, page)}
						{onDragStart}
						{onDragEnd}
						onDragOver={(e) => onDragOver(e, folder.path)}
						onDragEnter={(e) => onDragEnter(e, folder.path)}
						onDragLeave={(e) => onDragLeave(e, folder.path)}
						onDrop={(e) => onDrop(e, folder.path)}
					/>
				{/each}
			{/if}
		</div>
	{/if}
</div>
