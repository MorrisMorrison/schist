<script lang="ts">
	import {
		ChevronRight,
		ChevronDown,
		Folder,
		Plus,
		Trash2,
		Edit,
		MoreVertical
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import ErrorAlert from './ErrorAlert.svelte';
	import type { Folder as FolderType } from '$lib/api/types.js';
	import { folders, isFoldersLoading, foldersError } from '$lib/stores/pages.js';
	import { folderActions } from '$lib/stores/pages.js';
	import { cn } from '$lib/utils.js';

	// Props
	interface Props {
		selectedPath?: string;
		className?: string;
		showPageCounts?: boolean;
		enableContextMenu?: boolean;
		maxDepth?: number;
		onselect?: (event: { path: string; folder: FolderType }) => void;
		oncreate?: (event: { parentPath: string }) => void;
		ondelete?: (event: { path: string; folder: FolderType }) => void;
		onrename?: (event: { path: string; folder: FolderType }) => void;
	}

	let {
		selectedPath = '',
		className = '',
		showPageCounts = true,
		enableContextMenu = true,
		maxDepth = 10,
		onselect,
		oncreate,
		ondelete,
		onrename
	}: Props = $props();

	// Local state
	let expandedFolders = $state<Set<string>>(new Set(['/']));
	let contextMenuOpen = $state<string | null>(null);
	let contextMenuPosition = $state<{ x: number; y: number }>({ x: 0, y: 0 });

	// Load folders on mount
	$effect(() => {
		folderActions.loadFolderTree().catch(console.error);
	});

	// Context menu handling
	function handleContextMenu(event: MouseEvent | KeyboardEvent, folder: FolderType) {
		if (!enableContextMenu) return;

		event.preventDefault();
		event.stopPropagation();

		let x: number, y: number;
		if (event instanceof MouseEvent) {
			x = event.clientX;
			y = event.clientY;
		} else {
			// For keyboard events, position relative to the element
			const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
			x = rect.left + rect.width / 2;
			y = rect.top + rect.height / 2;
		}

		contextMenuPosition = { x, y };
		contextMenuOpen = folder.path;
	}

	function closeContextMenu() {
		contextMenuOpen = null;
	}

	// Folder interaction handlers
	function toggleExpanded(path: string) {
		if (expandedFolders.has(path)) {
			expandedFolders.delete(path);
		} else {
			expandedFolders.add(path);
		}
		expandedFolders = expandedFolders; // Trigger reactivity
	}

	function handleFolderClick(folder: FolderType) {
		// Toggle expansion
		toggleExpanded(folder.path);

		// Call selection callback
		onselect?.({ path: folder.path, folder });
	}

	function handleKeydown(event: KeyboardEvent, folder: FolderType) {
		switch (event.key) {
			case 'Enter':
			case ' ':
				event.preventDefault();
				handleFolderClick(folder);
				break;
			case 'ArrowRight':
				event.preventDefault();
				if (!expandedFolders.has(folder.path)) {
					expandedFolders.add(folder.path);
					expandedFolders = expandedFolders;
				}
				break;
			case 'ArrowLeft':
				event.preventDefault();
				if (expandedFolders.has(folder.path)) {
					expandedFolders.delete(folder.path);
					expandedFolders = expandedFolders;
				}
				break;
		}
	}

	// Context menu actions
	function handleCreateFolder(parentPath: string) {
		oncreate?.({ parentPath });
		closeContextMenu();
	}

	function handleDeleteFolder(folder: FolderType) {
		ondelete?.({ path: folder.path, folder });
		closeContextMenu();
	}

	function handleRenameFolder(folder: FolderType) {
		onrename?.({ path: folder.path, folder });
		closeContextMenu();
	}

	// Helper function to find folder by path in nested structure
	function findFolderByPath(folders: FolderType[], path: string): FolderType | null {
		for (const folder of folders) {
			if (folder.path === path) {
				return folder;
			}
			if (folder.sub_folders) {
				const found = findFolderByPath(folder.sub_folders, path);
				if (found) return found;
			}
		}
		return null;
	}

	// Handle clicks outside context menu
	function handleDocumentClick() {
		closeContextMenu();
	}

	$effect(() => {
		document.addEventListener('click', handleDocumentClick);
		return () => {
			document.removeEventListener('click', handleDocumentClick);
		};
	});
</script>

{#snippet folderNode(folder: FolderType, depth: number)}
	{@const isExpanded = expandedFolders.has(folder.path)}
	{@const isSelected = selectedPath === folder.path}
	{@const hasSubFolders = folder.sub_folders && folder.sub_folders.length > 0}
	{@const indentLevel = Math.min(depth, maxDepth)}

	<div class="folder-item">
		<!-- Folder Row -->
		<button
			type="button"
			class={cn(
				'group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
				'hover:bg-accent hover:text-accent-foreground',
				'focus:ring-ring focus:ring-2 focus:ring-offset-1 focus:outline-none',
				isSelected && 'bg-accent text-accent-foreground'
			)}
			style="margin-left: {indentLevel * 16}px"
			onclick={() => handleFolderClick(folder)}
			onkeydown={(e) => handleKeydown(e, folder)}
			oncontextmenu={(e) => handleContextMenu(e, folder)}
			role="treeitem"
			aria-expanded={hasSubFolders ? isExpanded : undefined}
			aria-selected={isSelected}
			aria-level={depth + 1}
			tabindex="0"
		>
			<!-- Expand/Collapse Icon -->
			<div class="flex h-4 w-4 flex-shrink-0 items-center justify-center">
				{#if hasSubFolders}
					{#if isExpanded}
						<ChevronDown class="h-3 w-3" />
					{:else}
						<ChevronRight class="h-3 w-3" />
					{/if}
				{/if}
			</div>
			<!-- Folder Icon -->
			<Folder class="h-4 w-4 flex-shrink-0 text-blue-500" />

			<!-- Folder Name -->
			<span class="flex-1 truncate text-left font-medium">
				{folder.name}
			</span>

			<!-- Page Count Badge -->
			{#if showPageCounts && folder.page_count > 0}
				<Badge variant="secondary" class="ml-auto text-xs">
					{folder.page_count}
				</Badge>
			{/if}

			<!-- Context Menu Trigger -->
			{#if enableContextMenu}
				<span
					class="hover:bg-accent cursor-pointer rounded p-1 opacity-0 group-hover:opacity-100"
					onclick={(e) => {
						e.stopPropagation();
						handleContextMenu(e, folder);
					}}
					onkeydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							e.stopPropagation();
							handleContextMenu(e, folder);
						}
					}}
					role="button"
					tabindex="0"
					aria-label="Folder options"
				>
					<MoreVertical class="h-3 w-3" />
				</span>
			{/if}
		</button>

		<!-- Sub-folders -->
		{#if isExpanded && hasSubFolders}
			<div class="mt-1">
				{#each folder.sub_folders as subFolder (subFolder.path)}
					{@render folderNode(subFolder, depth + 1)}
				{/each}
			</div>
		{/if}
	</div>
{/snippet}

<svelte:window onclick={handleDocumentClick} />

<div class={cn('folder-tree', className)}>
	<!-- Error Display -->
	{#if $foldersError}
		<ErrorAlert error={$foldersError} onDismiss={() => folderActions.clearError()} />
	{/if}

	<!-- Loading State -->
	{#if $isFoldersLoading}
		<div class="flex items-center justify-center py-8">
			<div class="border-border border-t-primary h-6 w-6 animate-spin rounded-full border-2"></div>
		</div>
	{:else if $folders.length === 0}
		<!-- Empty State -->
		<div class="flex flex-col items-center justify-center py-8 text-center">
			<Folder class="text-muted-foreground mb-4 h-12 w-12" />
			<h3 class="text-foreground mb-2 text-lg font-medium">No folders yet</h3>
			<p class="text-muted-foreground mb-4">Create your first folder to organize your pages.</p>
			<Button variant="outline" size="sm" onclick={() => oncreate?.({ parentPath: '/' })}>
				<Plus class="mr-2 h-4 w-4" />
				Create Folder
			</Button>
		</div>
	{:else}
		<!-- Folder Tree -->
		<div class="space-y-1" role="tree" aria-label="Folder tree">
			{#each $folders as folder (folder.path)}
				{@render folderNode(folder, 0)}
			{/each}
		</div>
	{/if}

	<!-- Context Menu -->
	{#if contextMenuOpen}
		<div
			class="bg-primary border-primary fixed z-50 min-w-[160px] rounded-lg border py-1 shadow-lg"
			style="left: {contextMenuPosition.x}px; top: {contextMenuPosition.y}px"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => {
				if (e.key === 'Escape') {
					closeContextMenu();
				}
			}}
			role="menu"
			aria-label="Folder actions"
			tabindex="-1"
		>
			<button
				type="button"
				class="hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
				onclick={() => {
					const folder = findFolderByPath($folders, contextMenuOpen || '');
					if (folder) handleCreateFolder(folder.path);
				}}
			>
				<Plus class="h-4 w-4" />
				Create Subfolder
			</button>
			<button
				type="button"
				class="hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
				onclick={() => {
					const folder = findFolderByPath($folders, contextMenuOpen || '');
					if (folder) handleRenameFolder(folder);
				}}
			>
				<Edit class="h-4 w-4" />
				Rename
			</button>
			<button
				type="button"
				class="hover:bg-destructive hover:text-destructive-foreground text-destructive flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
				onclick={() => {
					const folder = findFolderByPath($folders, contextMenuOpen || '');
					if (folder) handleDeleteFolder(folder);
				}}
			>
				<Trash2 class="h-4 w-4" />
				Delete
			</button>
		</div>
	{/if}
</div>

<style>
	.folder-tree {
		user-select: none;
	}

	.folder-item {
		position: relative;
	}
</style>
