<script lang="ts">
	import { Folder, Plus } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import ErrorAlert from '../ErrorAlert.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import FolderTreeNode from './FolderTreeNode.svelte';
	import FolderTreeToolbar from './FolderTreeToolbar.svelte';
	import FolderTreeSearch from './FolderTreeSearch.svelte';
	import FolderTreeContextMenus from './FolderTreeContextMenus.svelte';
	import type { Folder as FolderType, Document } from '$lib/api/types.js';
	import {
		foldersStore,
		documentsStore,
		documentActions,
		currentFolder,
		folderActions
	} from '$lib/stores/documents.svelte';
	import { authService } from '$lib/auth/auth-service';
	import { useDragAndDrop } from '$lib/composables/useDragAndDrop.svelte';
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


	let contextMenuOpen = $state<string | null>(null);
	let contextMenuPosition = $state<{ x: number; y: number }>({ x: 0, y: 0 });
	let pageContextMenuOpen = $state<string | null>(null);
	let pageContextMenuPosition = $state<{ x: number; y: number }>({ x: 0, y: 0 });
	let unifiedSearchQuery = $state('');

	const dragAndDrop = useDragAndDrop(showPages);

	const documents = $derived(documentsStore.documents || []);

	const filteredFolders = $derived(
		unifiedSearchQuery.trim()
			? filterFoldersAndPages(
					foldersStore.folders || [],
					documents,
					unifiedSearchQuery.toLowerCase()
				)
			: foldersStore.folders || []
	);

	let hasInitialized = $state(false);
	let expandedFolders = $state(new Set<string>());
	let userCollapsedFolders = $state(new Set<string>());

	$effect(() => {
		// Only load data if auth is disabled OR user is authenticated
		const loadData = async () => {
			await authService.initialize();

			// Skip loading if auth is enabled but user is not authenticated
			if (authService.isAuthEnabled()) {
				const isAuthenticated = await authService.checkAuthStatus();
				if (!isAuthenticated) {
					return;
				}
			}

			// Only load on first initialization
			if (!hasInitialized) {
				folderActions.loadFolderTree().catch(console.error);
				if (showPages) {
					documentActions.loadDocuments().catch(console.error);
				}
				hasInitialized = true;
			}
		};

		loadData();
	});

	$effect(() => {
		if (storageKey) {
			const savedExpanded = localStorage.getItem(storageKey);
			if (savedExpanded) {
				try {
					expandedFolders = new Set(JSON.parse(savedExpanded));
				} catch (e) {
					console.warn('Failed to parse saved expanded folders:', e);
				}
			}
		}
	});

	function saveExpandedFolders() {
		if (storageKey) {
			localStorage.setItem(storageKey, JSON.stringify([...expandedFolders]));
		}
	}

	function parseUnifiedQuery(query: string): { textQuery: string; tagFilters: string[] } {
		const words = query.split(/\s+/);
		const textParts: string[] = [];
		const tagFilters: string[] = [];

		for (const word of words) {
			if (word.toLowerCase().startsWith('tag:')) {
				const tagName = word.substring(4).toLowerCase();
				if (tagName) tagFilters.push(tagName);
			} else if (word.trim()) {
				textParts.push(word.toLowerCase());
			}
		}

		return {
			textQuery: textParts.join(' '),
			tagFilters
		};
	}

	function pageMatchesFilters(
		document: Document,
		textQuery: string,
		tagFilters: string[]
	): boolean {
		// Check text match in page title
		const textMatch = !textQuery || document.metaData.title.toLowerCase().includes(textQuery);

		// Check tag matches (AND logic - must match all specified tags with prefix matching)
		const tagMatch =
			tagFilters.length === 0 ||
			Boolean(
				document.metaData.tags &&
					tagFilters.every((requiredTag) =>
						document.metaData.tags!.some((pageTag) => pageTag.toLowerCase().startsWith(requiredTag))
					)
			);

		return textMatch && tagMatch;
	}

	function filterFoldersAndPages(
		folders: FolderType[],
		_allPages: Document[],
		query: string
	): FolderType[] {
		const { textQuery, tagFilters } = parseUnifiedQuery(query);

		function filterFolderRecursive(folder: FolderType): FolderType | null {
			const folderNameMatches = !textQuery || folder.name.toLowerCase().includes(textQuery);

			const folderPages = getPagesForFolder(folder.path);
			const matchingPages = folderPages.filter((page) =>
				pageMatchesFilters(page, textQuery, tagFilters)
			);

			const filteredSubFolders =
				folder.sub_folders
					?.map(filterFolderRecursive)
					?.filter((f): f is FolderType => f !== null) || [];

			const shouldInclude =
				folderNameMatches || matchingPages.length > 0 || filteredSubFolders.length > 0;

			if (shouldInclude) {
				return {
					...folder,
					sub_folders: filteredSubFolders,
					document_count: matchingPages.length
				};
			}

			return null;
		}

		return folders.map(filterFolderRecursive).filter((f): f is FolderType => f !== null);
	}

	function getPagesForFolder(folderPath: string) {
		return documents.filter((page) => {
			const pagePath = page.metaData?.path || '';

			if (folderPath === '' || folderPath === '/') {
				return pagePath.split('/').length === 2;
			}

			const folderSegments = folderPath.split('/').filter(Boolean);
			const pageSegments = pagePath.split('/').filter(Boolean);

			return (
				pageSegments.length === folderSegments.length + 1 &&
				pageSegments.slice(0, folderSegments.length).join('/') === folderSegments.join('/')
			);
		});
	}
	function getFilteredRootPages() {
		return getPagesForFolder('/');
	}

	function getFilteredPagesForFolder(folderPath: string) {
		return getPagesForFolder(folderPath);
	}

	function isCurrentPath(path: string): boolean {
		return currentPath === path;
	}

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

	function expandAll() {
		const getAllFolderPaths = (folders: FolderType[]): string[] => {
			let paths: string[] = [];
			for (const folder of folders) {
				paths.push(folder.path);
				if (folder.sub_folders) {
					paths = paths.concat(getAllFolderPaths(folder.sub_folders));
				}
			}
			return paths;
		};

		const allPaths = getAllFolderPaths(foldersStore.folders || []);
		if (showPages && (getPagesForFolder('/').length > 0 || (foldersStore.folders || []).length > 0)) {
			allPaths.push('/');
		}
		expandedFolders = new Set(allPaths);
		saveExpandedFolders();
		onexpandall?.();
	}

	function collapseAll() {
		expandedFolders = new Set();
		saveExpandedFolders();
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
		expandedFolders = new Set([...expandedFolders, path]);
		saveExpandedFolders();
	}

	function toggleExpanded(path: string) {
		if (expandedFolders.has(path)) {
			expandedFolders = new Set([...expandedFolders].filter(p => p !== path));
			userCollapsedFolders = new Set([...userCollapsedFolders, path]);
		} else {
			expandedFolders = new Set([...expandedFolders, path]);
			userCollapsedFolders = new Set([...userCollapsedFolders].filter(p => p !== path));
		}
		saveExpandedFolders();
	}

	export { expandFolder };

	$effect(() => {
		const current = currentFolder.value;
		if (current && current !== '/' && !userCollapsedFolders.has(current)) {
			expandFolder(current);
		}
	});
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
		return documents.find(doc => doc.metaData?.path === path) || null;
	}

	function getCurrentFolderFromPath(path: string): FolderType | null {
		if (path === '/') {
			return {
				name: '/',
				path: '/',
				created: new Date().toISOString(),
				document_count: getFilteredRootPages().length,
				sub_folders: filteredFolders
			};
		}
		return findFolderByPath(foldersStore.folders || [], path);
	}

	function handleOutsideClick() {
		closeContextMenu();
	}


	$effect(() => {
		document.addEventListener('click', handleOutsideClick);
		return () => {
			document.removeEventListener('click', handleOutsideClick);
		};
	});
</script>

<svelte:window onclick={handleOutsideClick} />


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

	{#if foldersStore.error}
		<ErrorAlert error={foldersStore.error} onDismiss={() => folderActions.clearError()} />
	{/if}

	{#if foldersStore.loading}
		<div class="flex items-center justify-center py-8">
			<LoadingSpinner size="md" />
		</div>
	{:else if !foldersStore.loading && foldersStore.folders !== null && filteredFolders.length === 0}
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
					isExpanded={expandedFolders.has('/')}
					isSelected={selectedPath === '/'}
					isCurrent={isCurrentPath('/')}
					{showPages}
					{showPageCounts}
					{enableContextMenu}
					filteredPages={getFilteredRootPages()}
					{selectedPath}
					{currentPath}
					isDragging={dragAndDrop.isDragging}
					draggedItem={dragAndDrop.draggedItem}
					dropTarget={dragAndDrop.dropTarget}
					dragOverTarget={dragAndDrop.dragOverTarget}
					{expandedFolders}
					onToggleExpanded={toggleExpanded}
					onFolderSelect={handleFolderSelect}
					onContextMenu={handleContextMenu}
					onDragStart={dragAndDrop.handleDragStart}
					onDragEnd={dragAndDrop.handleDragEnd}
					onDragOver={dragAndDrop.handleDragOver}
					onDragEnter={dragAndDrop.handleDragEnter}
					onDragLeave={dragAndDrop.handleDragLeave}
					onDrop={dragAndDrop.handleDrop}
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
						isExpanded={expandedFolders.has(folder.path)}
						isSelected={selectedPath === folder.path}
						isCurrent={isCurrentPath(folder.path)}
						{showPages}
						{showPageCounts}
						{enableContextMenu}
						filteredPages={getFilteredPagesForFolder(folder.path)}
						{selectedPath}
						{currentPath}
						isDragging={dragAndDrop.isDragging}
						draggedItem={dragAndDrop.draggedItem}
						dropTarget={dragAndDrop.dropTarget}
						dragOverTarget={dragAndDrop.dragOverTarget}
						{expandedFolders}
						onToggleExpanded={toggleExpanded}
						onFolderSelect={handleFolderSelect}
						onContextMenu={handleContextMenu}
						onDragStart={dragAndDrop.handleDragStart}
						onDragEnd={dragAndDrop.handleDragEnd}
						onDragOver={dragAndDrop.handleDragOver}
						onDragEnter={dragAndDrop.handleDragEnter}
						onDragLeave={dragAndDrop.handleDragLeave}
						onDrop={dragAndDrop.handleDrop}
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
