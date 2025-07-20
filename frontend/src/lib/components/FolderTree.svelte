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
		MoreVertical,
		Search
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import ErrorAlert from './ErrorAlert.svelte';
	import type { Folder as FolderType, Page } from '$lib/api/types.js';
	import {
		folders,
		isFoldersLoading,
		foldersError,
		pagesStore,
		pageActions
	} from '$lib/stores/pages.js';
	import { folderActions } from '$lib/stores/pages.js';
	import { browser } from '$app/environment';
	import { cn } from '$lib/utils.js';

	// Props
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
		onpageselect?: (event: { page: Page }) => void;
		oncreate?: (event: { parentPath: string }) => void;
		ondelete?: (event: { path: string; folder: FolderType }) => void;
		onrename?: (event: { path: string; folder: FolderType }) => void;
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
		onpageselect,
		oncreate,
		ondelete,
		onrename,
		onexpandall,
		oncollapseall
	}: Props = $props();

	// Local state
	let expandedFolders = $state<Set<string>>(new Set(['/']));
	let contextMenuOpen = $state<string | null>(null);
	let contextMenuPosition = $state<{ x: number; y: number }>({ x: 0, y: 0 });
	let searchQuery = $state('');

	// Derived state
	const pages = $derived($pagesStore.pages || []);

	// Filter folders based on search
	const filteredFolders = $derived(
		searchQuery.trim() ? filterFolders($folders || [], searchQuery.toLowerCase()) : $folders || []
	);

	// Load folders on mount
	$effect(() => {
		folderActions.loadFolderTree().catch(console.error);
		if (showPages) {
			pageActions.loadPages().catch(console.error);
		}
	});

	// Load expanded folders from localStorage on mount
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

	// Save expanded folders to localStorage
	function saveExpandedFolders() {
		if (browser && storageKey) {
			localStorage.setItem(storageKey, JSON.stringify([...expandedFolders]));
		}
	}

	// Filter folders based on search
	function filterFolders(folders: FolderType[], query: string): FolderType[] {
		return folders
			.filter((folder) => {
				const matchesName = folder.name.toLowerCase().includes(query);
				const hasMatchingSubfolder = folder.sub_folders?.some(
					(sub) => filterFolders([sub], query).length > 0
				);
				return matchesName || hasMatchingSubfolder;
			})
			.map((folder) => ({
				...folder,
				sub_folders: folder.sub_folders ? filterFolders(folder.sub_folders, query) : []
			}));
	}

	// Get pages for a specific folder path
	function getPagesForFolder(folderPath: string) {
		return pages.filter((page) => {
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

	// Check if path is current
	function isCurrentPath(path: string): boolean {
		return currentPath === `/folders${path}` || currentPath === `/folders${path}/`;
	}

	// Expand all folders
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
		// Include root folder if we're showing pages and have content
		if (showPages && (getPagesForFolder('/').length > 0 || $folders.length > 0)) {
			allPaths.push('/');
		}
		expandedFolders = new Set(allPaths);
		saveExpandedFolders();
		onexpandall?.();
	}

	// Collapse all folders
	function collapseAll() {
		expandedFolders = new Set();
		saveExpandedFolders();
		oncollapseall?.();
	}

	// Context menu handling
	function handleContextMenu(event: MouseEvent | KeyboardEvent, folder: FolderType) {
		if (!enableContextMenu) return;

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
	}

	// Folder interaction handlers
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
		// Only toggle expansion, no navigation
		toggleExpanded(folder.path);
	}

	function handleFolderNameClick(folder: FolderType) {
		// Only call selection callback for navigation, no expansion
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
	{@const isCurrent = isCurrentPath(folder.path)}
	{@const hasSubFolders = folder.sub_folders && folder.sub_folders.length > 0}
	{@const hasPages = showPages && getPagesForFolder(folder.path).length > 0}
	{@const hasExpandableContent = hasSubFolders || hasPages}
	{@const indentLevel = Math.min(depth, maxDepth)}

	<div class="relative">
		<!-- Folder Row -->
		<div
			class={cn(
				'group relative flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
				'hover:bg-accent hover:text-accent-foreground',
				isSelected && 'bg-accent text-accent-foreground',
				isCurrent && 'bg-blue-100 font-medium text-blue-700'
			)}
			oncontextmenu={(e) => handleContextMenu(e, folder)}
			role="treeitem"
			aria-expanded={hasExpandableContent ? isExpanded : undefined}
			aria-selected={isSelected}
			aria-level={depth + 1}
			tabindex="-1"
		>
			<!-- Indented content container -->
			<div class="flex w-full items-center gap-2 pr-8" style="margin-left: {indentLevel * 16}px">
				<!-- Expand/Collapse Icon - Separate clickable area -->
				<button
					type="button"
					class="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded"
					onclick={(e) => handleChevronClick(e, folder)}
					tabindex={hasExpandableContent ? 0 : -1}
					aria-label={isExpanded ? 'Collapse folder' : 'Expand folder'}
					disabled={!hasExpandableContent}
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
					class="focus:ring-ring flex flex-1 items-center gap-2 rounded px-1 py-0.5 text-left focus:ring-2 focus:ring-offset-1 focus:outline-none"
					onclick={() => handleFolderNameClick(folder)}
					onkeydown={(e) => handleKeydown(e, folder)}
					tabindex="0"
					aria-label={`Open folder ${folder.name}`}
				>
					<!-- Folder Icon -->
					<Folder class="h-4 w-4 flex-shrink-0 text-blue-500" />

					<!-- Folder Name -->
					<span class="flex-1 truncate font-medium">
						{folder.name}
					</span>

					<!-- Page Count Badge -->
					{#if showPageCounts && folder.page_count > 0}
						<span class="text-secondary text-xs opacity-75">({folder.page_count})</span>
					{/if}
				</button>
			</div>

			<!-- Context Menu Trigger - Positioned absolutely to the right -->
			{#if enableContextMenu}
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
					{#each getPagesForFolder(folder.path) as page (page.metaData?.slug || page.metaData?.path)}
						<div
							class="group hover:bg-accent hover:text-accent-foreground relative flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors"
							style="margin-left: {(depth + 1) * 16}px"
						>
							<div class="h-4 w-4"></div>
							<button
								type="button"
								class="focus:ring-ring flex flex-1 items-center gap-2 rounded px-1 py-0.5 text-left focus:ring-2 focus:ring-offset-1 focus:outline-none"
								onclick={() => onpageselect?.({ page })}
							>
								<File class="h-4 w-4 text-gray-500" />
								<span class="flex-1 truncate text-left">{page.metaData?.title || 'Untitled'}</span>
							</button>
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

<svelte:window onclick={handleDocumentClick} />

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
					onclick={() => oncreate?.({ parentPath: '' })}
					title="Create new folder"
				>
					<Plus class="h-4 w-4" />
				</Button>
			</div>
		</div>
	{/if}

	<!-- Search -->
	{#if showSearch}
		<div class="border-border border-b p-3">
			<div class="relative">
				<Search class="text-muted absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 transform" />
				<input
					type="text"
					bind:value={searchQuery}
					placeholder="Search folders..."
					class="bg-secondary border-border focus:ring-primary focus:border-primary w-full rounded-md border py-2 pr-3 pl-9 text-sm focus:ring-2 focus:outline-none"
				/>
			</div>
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
	{:else if filteredFolders.length === 0}
		<!-- Empty State -->
		<div class="flex flex-col items-center justify-center py-8 text-center">
			{#if searchQuery.trim()}
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
		<div class="space-y-1" role="tree" aria-label="Folder tree">
			<!-- Root folder containing root pages and root-level folders -->
			{#if showPages && (getPagesForFolder('/').length > 0 || filteredFolders.length > 0)}
				{@render folderNode(
					{
						name: '/',
						path: '/',
						created: new Date().toISOString(),
						page_count: getPagesForFolder('/').length,
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
				class="text-destructive hover:bg-destructive/10 flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors"
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
