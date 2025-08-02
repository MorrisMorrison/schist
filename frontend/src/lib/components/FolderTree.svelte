<script lang="ts">
	import {
		ChevronRight,
		ChevronDown,
		Folder,
		FolderOpen,
		File,
		Plus,
		Trash2,
		Edit,
		MoreVertical
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import ErrorAlert from './ErrorAlert.svelte';
	import UnifiedSidebarSearch from './UnifiedSidebarSearch.svelte';
	import type { Folder as FolderType, Document } from '$lib/api/types.js';
	import {
		folders,
		isFoldersLoading,
		foldersError,
		documentsStore,
		documentActions
	} from '$lib/stores/documents.js';
	import { folderActions } from '$lib/stores/documents.js';
	import { browser } from '$app/environment';
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
		ondelete?: (event: { path: string; folder: FolderType }) => void;
		onrename?: (event: { path: string; folder: FolderType }) => void;
		ondocumentdelete?: (event: { document: Document }) => void;
		ondocumentrename?: (event: { document: Document }) => void;
		onexpandall?: () => void;
		oncollapseall?: () => void;
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
		ondelete,
		onrename,
		ondocumentdelete,
		ondocumentrename,
		onexpandall,
		oncollapseall
	}: Props = $props();

	let expandedFolders = $state<Set<string>>(new Set(['/']));
	let contextMenuOpen = $state<string | null>(null);
	let contextMenuPosition = $state<{ x: number; y: number }>({ x: 0, y: 0 });
	let pageContextMenuOpen = $state<string | null>(null);
	let pageContextMenuPosition = $state<{ x: number; y: number }>({ x: 0, y: 0 });
	let unifiedSearchQuery = $state('');

	// Drag and Drop State
	let draggedItem = $state<{
		type: 'folder' | 'page';
		path: string;
		data: FolderType | Document;
	} | null>(null);
	let dropTarget = $state<string | null>(null);
	let isDragging = $state(false);
	let dragOverTarget = $state<string | null>(null);

	const documents = $derived($documentsStore.documents || []);

	const filteredFolders = $derived(
		unifiedSearchQuery.trim()
			? filterFoldersAndPages($folders || [], documents, unifiedSearchQuery.toLowerCase())
			: $folders || []
	);

	$effect(() => {
		folderActions.loadFolderTree().catch(console.error);
		if (showPages) {
			documentActions.loadDocuments().catch(console.error);
		}
	});

	$effect(() => {
		if (browser && storageKey) {
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
		if (browser && storageKey) {
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
		allPages: Document[],
		query: string
	): FolderType[] {
		const { textQuery, tagFilters } = parseUnifiedQuery(query);

		function filterFolderRecursive(folder: FolderType): FolderType | null {
			// Check if folder name matches text query (only when there IS a text query)
			const folderNameMatches = !textQuery || folder.name.toLowerCase().includes(textQuery);

			// Get pages in this folder that match the filters
			const folderPages = getPagesForFolder(folder.path);
			const matchingPages = folderPages.filter((page) =>
				pageMatchesFilters(page, textQuery, tagFilters)
			);

			// Recursively filter subfolders
			const filteredSubFolders =
				folder.sub_folders
					?.map(filterFolderRecursive)
					?.filter((f): f is FolderType => f !== null) || [];

			// Include folder if:
			// 1. Folder name matches text query (only when text query exists), OR
			// 2. Has matching pages, OR
			// 3. Has matching subfolders
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

			// Handle root folder case
			if (folderPath === '' || folderPath === '/') {
				// Pages in root folder don't have '/' after the first character
				return pagePath.split('/').length === 2; // ['', 'filename']
			}

			// For specific folders, check if page is directly in this folder
			const folderSegments = folderPath.split('/').filter(Boolean);
			const pageSegments = pagePath.split('/').filter(Boolean);

			// Page must be exactly one level deeper than the folder
			return (
				pageSegments.length === folderSegments.length + 1 &&
				pageSegments.slice(0, folderSegments.length).join('/') === folderSegments.join('/')
			);
		});
	}

	function getFilteredRootPages() {
		const rootPages = getPagesForFolder('/');

		// If no search query, return all root pages
		if (!unifiedSearchQuery.trim()) {
			return rootPages;
		}

		// Apply the same filtering logic as used in filterFoldersAndPages
		const { textQuery, tagFilters } = parseUnifiedQuery(unifiedSearchQuery.toLowerCase());
		return rootPages.filter((page) => pageMatchesFilters(page, textQuery, tagFilters));
	}

	function getFilteredPagesForFolder(folderPath: string) {
		const folderPages = getPagesForFolder(folderPath);

		// If no search query, return all pages in folder
		if (!unifiedSearchQuery.trim()) {
			return folderPages;
		}

		// Apply the same filtering logic as used in filterFoldersAndPages
		const { textQuery, tagFilters } = parseUnifiedQuery(unifiedSearchQuery.toLowerCase());
		return folderPages.filter((page) => pageMatchesFilters(page, textQuery, tagFilters));
	}

	function isCurrentPath(path: string): boolean {
		if (path === '/') {
			return currentPath === path || currentPath === '/folders';
		}
		return currentPath === `/folders${path}` || currentPath === `/folders${path}/`;
	}

	function isCurrentFile(path: string): boolean {
		return `/documents${path}` === currentPath;
	}

	function isSelectedFile(path: string): boolean {
		return `/documents${path}` === currentPath;
	}

	function getCurrentFolderPath(): string {
		console.log(currentPath);
		if (!currentPath || currentPath === '/' || currentPath === '' || currentPath === '/folders') {
			return '';
		}

		if (currentPath.startsWith('/folders')) {
			// Remove /folders prefix and return the remaining path
			const folderPath = currentPath.substring(8); // Remove '/folders'
			return folderPath || '';
		}

		if (currentPath.startsWith('/documents')) {
			// Remove /document prefix and remove the last element (page name)
			const pagePath = currentPath.substring(6); // Remove '/pages'
			const pathSegments = pagePath.split('/').filter(Boolean);

			// Remove the last segment (page name) and reconstruct the folder path
			if (pathSegments.length <= 1) {
				return '';
			}

			pathSegments.pop(); // Remove last element (page name)
			return '/' + pathSegments.join('/');
		}

		return '';
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

		const allPaths = getAllFolderPaths($folders);
		if (showPages && (getPagesForFolder('/').length > 0 || $folders.length > 0)) {
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

		// Don't show context menu for root folder when showPages is enabled
		// The root folder is synthetic and shouldn't have folder operations
		if (showPages && folder.path === '/') {
			return;
		}

		event.preventDefault();
		event.stopPropagation();

		const target = event.currentTarget as HTMLElement;
		const rect = target.getBoundingClientRect();

		let x: number, y: number;

		if (event instanceof MouseEvent) {
			// Position menu at mouse coordinates with small offset
			x = event.clientX + 5;
			y = event.clientY - 50; // Position above click point (working value)
		} else {
			// Fallback for keyboard events
			x = rect.left;
			y = rect.bottom + 2;
		}

		// Ensure the menu doesn't go off screen
		const menuWidth = 160;
		const menuHeight = 120;

		if (x + menuWidth > window.innerWidth) {
			x = window.innerWidth - menuWidth - 10;
		}
		if (y < 0) {
			y = 10; // Don't go above viewport
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

	function toggleExpanded(path: string) {
		if (expandedFolders.has(path)) {
			expandedFolders.delete(path);
		} else {
			expandedFolders.add(path);
		}
		// Create new Set to trigger reactivity
		expandedFolders = new Set(expandedFolders);
		saveExpandedFolders();
	}

	function handleChevronClick(event: MouseEvent, folder: FolderType) {
		event.preventDefault();
		event.stopPropagation();
		toggleExpanded(folder.path);
	}

	function handleFolderNameClick(folder: FolderType) {
		onselect?.({ path: folder.path, folder });
	}

	function handleKeydown(event: KeyboardEvent, folder: FolderType) {
		switch (event.key) {
			case 'Enter':
			case ' ':
				event.preventDefault();
				handleFolderNameClick(folder);
				break;
			case 'ArrowRight':
				event.preventDefault();
				if (!expandedFolders.has(folder.path)) {
					toggleExpanded(folder.path);
				}
				break;
			case 'ArrowLeft':
				event.preventDefault();
				if (expandedFolders.has(folder.path)) {
					toggleExpanded(folder.path);
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

	// Page context menu handlers
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

		// Ensure the menu doesn't go off screen
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
		closeContextMenu();
	}

	function handleRenamePage(page: Document) {
		ondocumentrename?.({ document: page });
		closeContextMenu();
	}

	function findPageByPath(path: string): Document | null {
		return documents.find((page) => page.metaData?.path === path) || null;
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

	function handleOutsideClick() {
		closeContextMenu();
	}

	$effect(() => {
		document.addEventListener('click', handleOutsideClick);
		return () => {
			document.removeEventListener('click', handleOutsideClick);
		};
	});

	function handleDragStart(
		event: DragEvent,
		type: 'folder' | 'page',
		path: string,
		data: FolderType | Document
	) {
		if (!event.dataTransfer) return;

		draggedItem = { type, path, data };
		isDragging = true;

		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData('application/json', JSON.stringify({ type, path, data }));

		if (event.target instanceof HTMLElement) {
			const dragImage = event.target.cloneNode(true) as HTMLElement;
			dragImage.style.opacity = '0.7';
			event.dataTransfer.setDragImage(dragImage, 0, 0);
		}
	}

	function handleDragEnd() {
		draggedItem = null;
		isDragging = false;
		dropTarget = null;
		dragOverTarget = null;
	}

	function handleDragOver(event: DragEvent, targetPath: string) {
		if (!draggedItem || draggedItem.path === targetPath) return;

		if (draggedItem.type === 'folder' && targetPath.startsWith(draggedItem.path + '/')) {
			return;
		}

		event.preventDefault();
		event.dataTransfer!.dropEffect = 'move';
		dragOverTarget = targetPath;
	}

	function handleDragEnter(event: DragEvent, targetPath: string) {
		if (!draggedItem || draggedItem.path === targetPath) return;

		if (draggedItem.type === 'folder' && targetPath.startsWith(draggedItem.path + '/')) {
			return;
		}

		event.preventDefault();
		dropTarget = targetPath;
	}

	function handleDragLeave(event: DragEvent, targetPath: string) {
		if (event.currentTarget === event.target) {
			if (dropTarget === targetPath) {
				dropTarget = null;
			}
			if (dragOverTarget === targetPath) {
				dragOverTarget = null;
			}
		}
	}

	async function handleDrop(event: DragEvent, targetPath: string) {
		event.preventDefault();

		if (!draggedItem) return;

		const { type, path: sourcePath } = draggedItem;

		if (sourcePath === targetPath) return;

		if (type === 'folder' && targetPath.startsWith(sourcePath + '/')) {
			return;
		}

		try {
			const sourcePathSegments = sourcePath.split('/').filter(Boolean);
			const itemName = sourcePathSegments[sourcePathSegments.length - 1];
			const newPath = targetPath === '/' ? `/${itemName}` : `${targetPath}/${itemName}`;

			if (type === 'folder') {
				await folderActions.moveFolder(sourcePath, newPath);
			} else {
				await documentActions.moveDocumentPath(sourcePath, newPath);
			}

			await folderActions.loadFolderTree();
			if (showPages) {
				await documentActions.loadDocuments();
			}
		} catch (error) {
			console.error('Failed to move item:', error);
		} finally {
			draggedItem = null;
			isDragging = false;
			dropTarget = null;
			dragOverTarget = null;
		}
	}
</script>

{#snippet folderNode(folder: FolderType, depth: number)}
	{@const isExpanded = expandedFolders.has(folder.path)}
	{@const isSelected = selectedPath === folder.path}
	{@const isCurrent = isCurrentPath(folder.path)}
	{@const hasSubFolders = folder.sub_folders && folder.sub_folders.length > 0}
	{@const hasPages = showPages && getFilteredPagesForFolder(folder.path).length > 0}
	{@const hasExpandableContent = hasSubFolders || hasPages}
	{@const indentLevel = Math.min(depth, maxDepth)}
	{@const isBeingDragged = isDragging && draggedItem?.path === folder.path}
	{@const isDropTarget = dropTarget === folder.path}
	{@const isDragOver = dragOverTarget === folder.path}

	<div class="relative">
		<!-- Folder Row -->
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
			ondragstart={(e) => handleDragStart(e, 'folder', folder.path, folder)}
			ondragend={handleDragEnd}
			ondragover={(e) => handleDragOver(e, folder.path)}
			ondragenter={(e) => handleDragEnter(e, folder.path)}
			ondragleave={(e) => handleDragLeave(e, folder.path)}
			ondrop={(e) => handleDrop(e, folder.path)}
			oncontextmenu={(e) => {
				handleContextMenu(e, folder);
			}}
			role="treeitem"
			aria-expanded={hasExpandableContent ? isExpanded : undefined}
			aria-selected={isSelected}
			aria-level={depth + 1}
			tabindex="-1"
			data-testid="folder-tree-item"
		>
			<!-- Indented content container -->
			<div class="flex w-full items-center gap-2 pr-8" style="margin-left: {indentLevel * 16}px">
				<!-- Expand/Collapse Icon - Separate clickable area -->
				<button
					type="button"
					class="flex h-4 w-4 flex-shrink-0 cursor-pointer items-center justify-center rounded"
					onclick={(e) => handleChevronClick(e, folder)}
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
				<!-- Folder Name Area - Clickable for navigation -->
				<button
					type="button"
					class="focus:ring-ring flex flex-1 cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-left focus:ring-2 focus:ring-offset-1 focus:outline-none"
					onclick={() => handleFolderNameClick(folder)}
					onkeydown={(e) => handleKeydown(e, folder)}
					tabindex="0"
					aria-label={`Open folder ${folder.name}`}
					data-testid="folder-name-button"
				>
					<!-- Folder Icon -->
					<Folder class="text-blue-primary h-4 w-4 flex-shrink-0" />

					<!-- Folder Name -->
					<span class="flex-1 truncate font-medium">
						{folder.name}
					</span>

					<!-- Page Count Badge -->
					{#if showPageCounts && folder.document_count > 0}
						<span class="text-secondary text-xs opacity-75">({folder.document_count})</span>
					{/if}
				</button>
			</div>

			<!-- Context Menu Trigger - Positioned absolutely to the right -->
			{#if enableContextMenu && !(showPages && folder.path === '/')}
				<span
					class="hover:bg-accent absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer rounded p-1 opacity-0 group-hover:opacity-100"
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
					data-testid="folder-context-menu-trigger"
				>
					<MoreVertical class="h-3 w-3" />
				</span>
			{/if}
		</div>

		<!-- Sub-folders and pages when expanded -->
		{#if isExpanded}
			<div class="mt-1">
				<!-- Render pages in current folder first if showPages is enabled -->
				{#if showPages}
					{#each getFilteredPagesForFolder(folder.path) as page (page.metaData?.slug || page.metaData?.path)}
						{@const pageIsBeingDragged = isDragging && draggedItem?.path === page.metaData.path}
						{@const pageIsDropTarget = dropTarget === page.metaData.path}
						{@const pageIsDragOver = dragOverTarget === page.metaData.path}
						<div
							class={cn(
								'group relative flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
								'hover:bg-accent hover:text-accent-foreground',
								isSelectedFile(page.metaData.path) && 'bg-accent text-accent-foreground',
								isCurrentFile(page.metaData.path) && 'bg-accent font-medium',
								pageIsBeingDragged && 'opacity-50',
								pageIsDropTarget && 'bg-primary/10 ring-primary ring-2',
								pageIsDragOver && 'bg-primary/20'
							)}
							draggable="true"
							ondragstart={(e) => handleDragStart(e, 'page', page.metaData.path, page)}
							ondragend={handleDragEnd}
							ondragover={(e) => handleDragOver(e, folder.path)}
							ondragenter={(e) => handleDragEnter(e, folder.path)}
							ondragleave={(e) => handleDragLeave(e, folder.path)}
							ondrop={(e) => handleDrop(e, folder.path)}
							oncontextmenu={(e) => handlePageContextMenu(e, page)}
							role="treeitem"
							aria-label={`Page: ${page.metaData?.title || 'Untitled'}`}
							aria-selected={isSelectedFile(page.metaData.path)}
							tabindex="-1"
							data-testid="page-item"
						>
							<!-- Indented content container -->
							<div
								class="flex w-full items-center gap-2 pr-8"
								style="margin-left: {(depth + 1) * 16}px"
							>
								<div class="h-4 w-4"></div>
								<button
									type="button"
									class="focus:ring-ring flex flex-1 cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-left focus:ring-2 focus:ring-offset-1 focus:outline-none"
									onclick={() => ondocumentselect?.({ document: page })}
									data-testid="page-name-button"
								>
									<File class="text-blue-primary h-4 w-4" />
									<span class="flex-1 truncate text-left">{page.metaData?.title || 'Untitled'}</span
									>
								</button>
							</div>

							<!-- Page Context Menu Trigger - Positioned absolutely to the right -->
							{#if enableContextMenu}
								<span
									class="hover:bg-accent absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer rounded p-1 opacity-0 group-hover:opacity-100"
									onclick={(e) => {
										e.stopPropagation();
										handlePageContextMenu(e, page);
									}}
									onkeydown={(e) => {
										if (e.key === 'Enter' || e.key === ' ') {
											e.preventDefault();
											e.stopPropagation();
											handlePageContextMenu(e, page);
										}
									}}
									role="button"
									tabindex="0"
									aria-label="Page options"
								>
									<MoreVertical class="h-3 w-3" />
								</span>
							{/if}
						</div>
					{/each}
				{/if}

				<!-- Render sub-folders -->
				{#if hasSubFolders}
					{#each folder.sub_folders as subFolder (subFolder.path)}
						{@render folderNode(subFolder, depth + 1)}
					{/each}
				{/if}
			</div>
		{/if}
	</div>
{/snippet}

<svelte:window onclick={handleOutsideClick} />

<div class={cn('select-none', className)}>
	<!-- Actions Header -->
	{#if showActions}
		<div class="border-border flex items-center justify-between border-b p-4">
			<h2 class="text-primary text-lg font-semibold">Pages</h2>
			<div class="flex items-center gap-1">
				<Button
					variant="ghost"
					size="icon"
					class="h-6 w-6"
					onclick={expandAll}
					title="Expand all folders"
				>
					<FolderOpen class="h-4 w-4" />
				</Button>
				<Button
					variant="ghost"
					size="icon"
					class="h-6 w-6"
					onclick={collapseAll}
					title="Collapse all folders"
				>
					<Folder class="h-4 w-4" />
				</Button>
				<Button
					variant="ghost"
					size="icon"
					class="h-6 w-6"
					onclick={() => oncreate?.({ parentPath: getCurrentFolderPath() })}
					title="Create new folder"
				>
					<Plus class="h-4 w-4" />
				</Button>
			</div>
		</div>
	{/if}

	<!-- Enhanced Search with Tag Support -->
	{#if showSearch}
		<div class="border-border border-b p-3">
			<UnifiedSidebarSearch
				dataTestId="sidebar-search"
				value={unifiedSearchQuery}
				placeholder="Filter folders, pages... (try 'tag:name')"
				onSearch={(query) => {
					unifiedSearchQuery = query;
				}}
			/>
		</div>
	{/if}

	<!-- Error Display -->
	{#if $foldersError}
		<ErrorAlert error={$foldersError} onDismiss={() => folderActions.clearError()} />
	{/if}

	<!-- Loading State -->
	{#if $isFoldersLoading}
		<div class="flex items-center justify-center py-8">
			<div class="border-border border-t-primary h-6 w-6 animate-spin rounded-full border-2"></div>
		</div>
	{:else if !$isFoldersLoading && $folders !== null && filteredFolders.length === 0}
		<!-- Empty State -->
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
					// Ensure any existing context menu is closed
					closeContextMenu();
				}
			}}
		>
			<!-- Root folder containing root pages and root-level folders -->
			{#if showPages}
				{@render folderNode(
					{
						name: '/',
						path: '/',
						created: new Date().toISOString(),
						document_count: getFilteredRootPages().length,
						sub_folders: filteredFolders
					},
					0
				)}
			{:else}
				{#each filteredFolders as folder (folder.path)}
					{@render folderNode(folder, 0)}
				{/each}
			{/if}
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
			data-testid="context-menu"
			tabindex="-1"
		>
			<button
				type="button"
				class="hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
				onclick={() => {
					if (contextMenuOpen) {
						handleCreateFolder(contextMenuOpen);
					}
				}}
			>
				<Plus class="h-4 w-4" />
				Create Subfolder
			</button>
			{#if contextMenuOpen !== '/' && contextMenuOpen !== ''}
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
					class="text-destructive hover:bg-destructive/10 flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors"
					onclick={() => {
						const folder = findFolderByPath($folders, contextMenuOpen || '');
						if (folder) handleDeleteFolder(folder);
					}}
				>
					<Trash2 class="h-4 w-4" />
					Delete
				</button>
			{/if}
		</div>
	{/if}

	<!-- Page Context Menu -->
	{#if pageContextMenuOpen}
		<div
			class="bg-primary border-primary fixed z-50 min-w-[160px] rounded-lg border py-1 shadow-lg"
			style="left: {pageContextMenuPosition.x}px; top: {pageContextMenuPosition.y}px"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => {
				if (e.key === 'Escape') {
					closeContextMenu();
				}
			}}
			role="menu"
			aria-label="Page actions"
			tabindex="-1"
		>
			<button
				type="button"
				class="hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
				onclick={() => {
					const page = findPageByPath(pageContextMenuOpen || '');
					if (page) handleRenamePage(page);
				}}
			>
				<Edit class="h-4 w-4" />
				Rename
			</button>
			<button
				type="button"
				class="text-destructive hover:bg-destructive/10 flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors"
				onclick={() => {
					const page = findPageByPath(pageContextMenuOpen || '');
					if (page) handleDeletePage(page);
				}}
			>
				<Trash2 class="h-4 w-4" />
				Delete
			</button>
		</div>
	{/if}
</div>
