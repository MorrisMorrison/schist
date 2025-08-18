<script lang="ts">
	import { Folder, Plus } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import ErrorAlert from '../ErrorAlert.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import FolderTreeNode from './FolderTreeNode.svelte';
	import FolderTreeManager from './FolderTreeManager.svelte';
	import { FolderTreeState } from './FolderTreeState.js';
	import { createFolderTreeFiltering } from './FolderTreeFiltering.js';
	import FolderTreeToolbar from './FolderTreeToolbar.svelte';
	import FolderTreeSearch from './FolderTreeSearch.svelte';
	import FolderTreeContextMenus from './FolderTreeContextMenus.svelte';
	import type { Folder as FolderType, Document } from '$lib/api/types.js';
	import { 
		folders, 
		isFoldersLoading, 
		foldersError, 
		documentsStore 
	} from '$lib/stores/documents';
	import { folderActions } from '$lib/stores/documents';
	import { cn } from '$lib/utils.js';

	interface Props {
		selectedPath?: string;
		className?: string;
		showPageCounts?: boolean;
		showPages?: boolean;
		showSearch?: boolean;
		showActions?: boolean;
		enableContextMenu?: boolean;
		maxDepth?: number;
		storageKey?: string;
		currentPath?: string;
		onselect?: (event: { path: string; folder: FolderType }) => void;
		ondocumentselect?: (event: { document: Document }) => void;
		oncreate?: (event: { parentPath: string }) => void;
		ondocumentcreate?: (event: { parentPath: string }) => void;
		ondelete?: (event: { path: string; folder: FolderType }) => void;
		onrename?: (event: { path: string; folder: FolderType }) => void;
		ondocumentdelete?: (event: { document: Document }) => void;
		ondocumentrename?: (event: { document: Document }) => void;
		onexpandall?: () => void;
		oncollapseall?: () => void;
		onfolderexport?: (event: { path: string; folder: FolderType }) => void;
		ondocumentexport?: (event: { path: string; document: Document }) => void;
		onexportall?: () => void;
	}

	let {
		selectedPath = '',
		className = '',
		showPageCounts = true,
		showPages = false,
		showSearch = false,
		showActions = false,
		enableContextMenu = true,
		maxDepth = 10,
		storageKey = 'folder-tree-expanded',
		currentPath = '',
		onselect,
		ondocumentselect,
		oncreate,
		ondocumentcreate,
		ondelete,
		onrename,
		ondocumentdelete,
		ondocumentrename,
		onexpandall,
		oncollapseall,
		onfolderexport,
		ondocumentexport,
		onexportall
	}: Props = $props();

	const filtering = createFolderTreeFiltering();
	let manager: FolderTreeManager | undefined;
	let stateUpdateTrigger = $state(0); // Used to trigger reactivity when state changes
	
	// Create tree state with update callback
	const treeState = new FolderTreeState(storageKey, () => {
		stateUpdateTrigger++; // Trigger reactivity
	});

	let contextMenuOpen = $state<string | null>(null);
	let contextMenuPosition = $state<{ x: number; y: number }>({ x: 0, y: 0 });
	let pageContextMenuOpen = $state<string | null>(null);
	let pageContextMenuPosition = $state<{ x: number; y: number }>({ x: 0, y: 0 });
	let unifiedSearchQuery = $state('');

	const managerState = $derived.by(() => {
		// Trigger reactivity when manager is bound
		stateUpdateTrigger;
		
		if (!manager) {
			// Access the store directly while manager is initializing
			return {
				folders: $folders || [],
				documents: $documentsStore.documents || [],
				isLoading: $isFoldersLoading, // Use store loading state
				dragAndDrop: {
					isDragging: false,
					draggedItem: null,
					dropTarget: null,
					dragOverTarget: null,
					handleDragStart: () => {},
					handleDragEnd: () => {},
					handleDragOver: () => {},
					handleDragEnter: () => {},
					handleDragLeave: () => {},
					handleDrop: () => {}
				}
			};
		}
		return manager.getState();
	});

	const filteredFolders = $derived(
		unifiedSearchQuery.trim()
			? filtering.filterFoldersAndPages(
					managerState.folders,
					managerState.documents,
					unifiedSearchQuery.toLowerCase(),
					(folderPath: string) => filtering.getPagesForFolder(folderPath, managerState.documents)
				)
			: managerState.folders
	);

	function getFilteredRootPages() {
		return filtering.getFilteredRootPages(managerState.documents, unifiedSearchQuery);
	}

	function getFilteredPagesForFolder(folderPath: string) {
		return filtering.getFilteredPagesForFolder(
			folderPath,
			managerState.documents,
			unifiedSearchQuery
		);
	}

	function isCurrentPath(path: string): boolean {
		return manager?.isCurrentPath(path, currentPath) || false;
	}

	function expandAll() {
		treeState.expandAll(managerState.folders);
		if (showPages && (getFilteredRootPages().length > 0 || managerState.folders.length > 0)) {
			treeState.expandFolder('/');
		}
		onexpandall?.();
	}

	function collapseAll() {
		treeState.collapseAll();
		oncollapseall?.();
	}

	function handleContextMenu(event: MouseEvent | KeyboardEvent, folder: FolderType) {
		if (!enableContextMenu) return;

		event.preventDefault();
		event.stopPropagation();

		const target = event.currentTarget as HTMLElement;
		const rect = target.getBoundingClientRect();

		let x: number, y: number;

		if (event instanceof MouseEvent) {
			x = event.clientX + 5;
			y = event.clientY - 50;
		} else {
			x = rect.left;
			y = rect.bottom + 2;
		}

		const menuWidth = 160;
		const menuHeight = 120;

		if (x + menuWidth > window.innerWidth) {
			x = window.innerWidth - menuWidth - 10;
		}
		if (y < 0) {
			y = 10;
		}
		if (y + menuHeight > window.innerHeight) {
			y = window.innerHeight - menuHeight - 10;
		}

		contextMenuPosition = { x, y };
		contextMenuOpen = folder.path;
	}

	function closeContextMenu() {
		contextMenuOpen = null;
		pageContextMenuOpen = null;
	}

	function expandFolder(path: string) {
		treeState.expandFolder(path);
	}

	export { expandFolder };

	function handleFolderSelect(folder: FolderType) {
		onselect?.({ path: folder.path, folder });
	}

	function handleCreateFolder(parentPath: string) {
		oncreate?.({ parentPath });
	}

	function handleDeleteFolder(folder: FolderType) {
		ondelete?.({ path: folder.path, folder });
	}

	function handleRenameFolder(folder: FolderType) {
		onrename?.({ path: folder.path, folder });
	}

	function handleFolderExport(folder: FolderType) {
		if (folder.path === '/' && onexportall) {
			onexportall();
		} else if (onfolderexport) {
			onfolderexport({ path: folder.path, folder });
		}
	}

	function handlePageContextMenu(event: MouseEvent | KeyboardEvent, page: Document) {
		if (!enableContextMenu) return;

		event.preventDefault();
		event.stopPropagation();

		const target = event.currentTarget as HTMLElement;
		const rect = target.getBoundingClientRect();

		let x: number, y: number;

		if (event instanceof MouseEvent) {
			x = event.clientX + 5;
			y = event.clientY - 50;
		} else {
			x = rect.left;
			y = rect.bottom + 2;
		}

		const menuWidth = 160;
		const menuHeight = 80;

		if (x + menuWidth > window.innerWidth) {
			x = window.innerWidth - menuWidth - 10;
		}
		if (y < 0) {
			y = 10;
		}
		if (y + menuHeight > window.innerHeight) {
			y = window.innerHeight - menuHeight - 10;
		}

		pageContextMenuPosition = { x, y };
		pageContextMenuOpen = page.metaData?.path || '';
	}

	function handleDeletePage(page: Document) {
		ondocumentdelete?.({ document: page });
	}

	function handleRenamePage(page: Document) {
		ondocumentrename?.({ document: page });
	}

	function handleDocumentExport(page: Document) {
		if (ondocumentexport) {
			ondocumentexport({ path: page.metaData.path, document: page });
		}
	}

	function findPageByPath(path: string): Document | null {
		return manager?.findDocumentByPath(path) || null;
	}

	function getCurrentFolderFromPath(path: string): FolderType | null {
		if (!manager) return null;
		return manager.getCurrentFolderFromPath(path);
	}

	function handleOutsideClick() {
		closeContextMenu();
	}

	// Trigger reactivity when manager becomes available
	$effect(() => {
		if (manager) {
			stateUpdateTrigger++;
		}
	});

	$effect(() => {
		document.addEventListener('click', handleOutsideClick);
		return () => {
			document.removeEventListener('click', handleOutsideClick);
		};
	});
</script>

<svelte:window onclick={handleOutsideClick} />

<!-- Initialize manager -->
<FolderTreeManager bind:this={manager} {showPages} {storageKey} />

<div class={cn('select-none', className)}>
	{#if showActions}
		<FolderTreeToolbar
			title="Pages"
			onExpandAll={expandAll}
			onCollapseAll={collapseAll}
			onCreateDocument={() => ondocumentcreate?.({ parentPath: '/' })}
			showExpandCollapse={true}
			showCreateDocument={true}
		/>
	{/if}

	{#if showSearch}
		<FolderTreeSearch
			value={unifiedSearchQuery}
			placeholder="Filter folders, pages... (try 'tag:name')"
			dataTestId="sidebar-search"
			onSearch={(query: string) => {
				unifiedSearchQuery = query;
			}}
		/>
	{/if}

	{#if $foldersError}
		<ErrorAlert error={$foldersError} onDismiss={() => folderActions.clearError()} />
	{/if}

	{#if managerState.isLoading}
		<div class="flex items-center justify-center py-8">
			<LoadingSpinner size="md" />
		</div>
	{:else if !managerState.isLoading && managerState.folders !== null && filteredFolders.length === 0}
		<div class="flex flex-col items-center justify-center py-8 text-center">
			{#if unifiedSearchQuery.trim()}
				<p class="text-secondary text-sm">No folders match your search.</p>
			{:else}
				<Folder class="text-muted-foreground mb-4 h-12 w-12" />
				<h3 class="text-foreground mb-2 text-lg font-medium">No folders yet</h3>
				<p class="text-muted-foreground mb-4">Create your first folder to organize your pages.</p>
				<Button variant="outline" size="sm" onclick={() => oncreate?.({ parentPath: '/' })}>
					<Plus class="mr-2 h-4 w-4" />
					Create Folder
				</Button>
			{/if}
		</div>
	{:else}
		<!-- Folder Tree -->
		<div
			class="space-y-1"
			role="tree"
			aria-label="Folder tree"
			data-testid="folder-tree"
			tabindex="0"
			oncontextmenu={(e) => {
				// Prevent context menu from appearing when right-clicking on empty tree space
				// Only allow context menus on specific folder/page items
				const target = e.target as HTMLElement;
				const isTreeItem =
					target.closest('[role="treeitem"]') ||
					target.closest('[data-testid="folder-context-menu-trigger"]');
				if (!isTreeItem) {
					e.preventDefault();
					e.stopPropagation();
					closeContextMenu();
				}
			}}
		>
			{#if showPages}
				<FolderTreeNode
					folder={{
						name: '/',
						path: '/',
						created: new Date().toISOString(),
						document_count: getFilteredRootPages().length,
						sub_folders: filteredFolders
					}}
					depth={0}
					{maxDepth}
					isExpanded={(() => { stateUpdateTrigger; return treeState.isExpanded('/'); })()}
					isSelected={selectedPath === '/'}
					isCurrent={isCurrentPath('/')}
					{showPages}
					{showPageCounts}
					{enableContextMenu}
					filteredPages={getFilteredRootPages()}
					{selectedPath}
					{currentPath}
					isDragging={managerState.dragAndDrop.isDragging}
					draggedItem={managerState.dragAndDrop.draggedItem}
					dropTarget={managerState.dragAndDrop.dropTarget}
					dragOverTarget={managerState.dragAndDrop.dragOverTarget}
					expandedFolders={(() => { stateUpdateTrigger; return treeState.expanded; })()}
					onToggleExpanded={(path) => treeState.toggleExpanded(path)}
					onFolderSelect={handleFolderSelect}
					onContextMenu={handleContextMenu}
					onDragStart={managerState.dragAndDrop.handleDragStart}
					onDragEnd={managerState.dragAndDrop.handleDragEnd}
					onDragOver={managerState.dragAndDrop.handleDragOver}
					onDragEnter={managerState.dragAndDrop.handleDragEnter}
					onDragLeave={managerState.dragAndDrop.handleDragLeave}
					onDrop={managerState.dragAndDrop.handleDrop}
					onDocumentSelect={ondocumentselect}
					onDocumentContextMenu={handlePageContextMenu}
					{getFilteredPagesForFolder}
				/>
			{:else}
				{#each filteredFolders as folder (folder.path)}
					<FolderTreeNode
						{folder}
						depth={0}
						{maxDepth}
						isExpanded={(() => { stateUpdateTrigger; return treeState.isExpanded(folder.path); })()}
						isSelected={selectedPath === folder.path}
						isCurrent={isCurrentPath(folder.path)}
						{showPages}
						{showPageCounts}
						{enableContextMenu}
						filteredPages={getFilteredPagesForFolder(folder.path)}
						{selectedPath}
						{currentPath}
						isDragging={managerState.dragAndDrop.isDragging}
						draggedItem={managerState.dragAndDrop.draggedItem}
						dropTarget={managerState.dragAndDrop.dropTarget}
						dragOverTarget={managerState.dragAndDrop.dragOverTarget}
						expandedFolders={(() => { stateUpdateTrigger; return treeState.expanded; })()}
						onToggleExpanded={(path) => treeState.toggleExpanded(path)}
						onFolderSelect={handleFolderSelect}
						onContextMenu={handleContextMenu}
						onDragStart={managerState.dragAndDrop.handleDragStart}
						onDragEnd={managerState.dragAndDrop.handleDragEnd}
						onDragOver={managerState.dragAndDrop.handleDragOver}
						onDragEnter={managerState.dragAndDrop.handleDragEnter}
						onDragLeave={managerState.dragAndDrop.handleDragLeave}
						onDrop={managerState.dragAndDrop.handleDrop}
						onDocumentSelect={ondocumentselect}
						onDocumentContextMenu={handlePageContextMenu}
						{getFilteredPagesForFolder}
					/>
				{/each}
			{/if}
		</div>
	{/if}

	<FolderTreeContextMenus
		folderMenuOpen={contextMenuOpen}
		folderMenuPosition={contextMenuPosition}
		currentFolder={contextMenuOpen ? getCurrentFolderFromPath(contextMenuOpen) : null}
		documentMenuOpen={pageContextMenuOpen}
		documentMenuPosition={pageContextMenuPosition}
		currentDocument={pageContextMenuOpen ? findPageByPath(pageContextMenuOpen) : null}
		onClose={closeContextMenu}
		onCreateFolder={handleCreateFolder}
		onCreateDocument={(parentPath) => ondocumentcreate?.({ parentPath })}
		onRenameFolder={handleRenameFolder}
		onDeleteFolder={handleDeleteFolder}
		onFolderExport={onfolderexport ? handleFolderExport : undefined}
		onExportAll={onexportall}
		onRenameDocument={handleRenamePage}
		onDeleteDocument={handleDeletePage}
		onDocumentExport={ondocumentexport ? handleDocumentExport : undefined}
	/>
</div>
