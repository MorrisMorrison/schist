<script lang="ts">
	import { onMount } from 'svelte';
	import { foldersStore, folderActions, pagesStore, pageActions } from '$lib/stores/pages';
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import { Button } from '$lib/components/ui/button';
	import { Folder, FolderOpen, File, ChevronRight, Plus, Search } from 'lucide-svelte';
	import CreateFolderModal from './CreateFolderModal.svelte';
	import type { Folder as FolderType } from '$lib/api/types';

	let searchQuery = $state('');
	let expandedFolders = $state(new Set<string>());
	let showCreateFolderModal = $state(false);
	let parentPathForModal = $state('');

	const currentPath = $derived(page.url.pathname);
	const folders = $derived($foldersStore.folders || []);
	const isLoading = $derived($foldersStore.loading);
	const pages = $derived($pagesStore.pages || []);

	// Filter folders based on search
	const filteredFolders = $derived(
		searchQuery.trim() ? filterFolders(folders || [], searchQuery.toLowerCase()) : folders || []
	);

	onMount(() => {
		folderActions.loadFolderTree();
		pageActions.loadPages();

		// Restore expanded folders from localStorage
		if (browser) {
			const savedExpanded = localStorage.getItem('sidebar-expanded-folders');
			if (savedExpanded) {
				try {
					expandedFolders = new Set(JSON.parse(savedExpanded));
				} catch (e) {
					console.warn('Failed to parse saved expanded folders:', e);
				}
			}
		}

		// Auto-expand folders containing the current path
		if (currentPath.startsWith('/folders/')) {
			const pathSegments = currentPath.replace('/folders/', '').split('/');
			let buildPath = '';
			for (const segment of pathSegments) {
				if (segment) {
					buildPath += `/${segment}`;
					expandedFolders.add(buildPath);
				}
			}
			expandedFolders = new Set(expandedFolders);
		}
	});

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

	function toggleFolder(folderPath: string) {
		if (expandedFolders.has(folderPath)) {
			expandedFolders.delete(folderPath);
		} else {
			expandedFolders.add(folderPath);
		}
		expandedFolders = new Set(expandedFolders);

		// Save to localStorage
		if (browser) {
			localStorage.setItem('sidebar-expanded-folders', JSON.stringify([...expandedFolders]));
		}
	}

	function isCurrentPath(path: string): boolean {
		return currentPath === `/folders${path}` || currentPath === `/folders${path}/`;
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
			// e.g., for folder '/anotherfolder', match pages like '/anotherfolder/page'
			// but not '/anotherfolder/subfolder/page'
			const folderSegments = folderPath.split('/').filter(Boolean);
			const pageSegments = pagePath.split('/').filter(Boolean);

			// Page must be exactly one level deeper than the folder
			return (
				pageSegments.length === folderSegments.length + 1 &&
				pageSegments.slice(0, folderSegments.length).join('/') === folderSegments.join('/')
			);
		});
	}

	function createFolder(parentPath: string) {
		parentPathForModal = parentPath;
		showCreateFolderModal = true;
	}

	function handleFolderCreated() {
		showCreateFolderModal = false;
		parentPathForModal = '';
		folderActions.loadFolderTree();
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

		const allPaths = getAllFolderPaths(folders);
		expandedFolders = new Set(allPaths);

		// Save to localStorage
		if (browser) {
			localStorage.setItem('sidebar-expanded-folders', JSON.stringify([...expandedFolders]));
		}
	}

	// Collapse all folders
	function collapseAll() {
		expandedFolders = new Set();

		// Save to localStorage
		if (typeof window !== 'undefined') {
			localStorage.setItem('sidebar-expanded-folders', JSON.stringify([]));
		}
	}

	function renderFolderTree(folders: FolderType[], depth: number = 0) {
		return folders.map((folder) => ({
			folder,
			isExpanded: expandedFolders.has(folder.path),
			isCurrent: isCurrentPath(folder.path),
			depth,
			hasSubFolders: folder.sub_folders && folder.sub_folders.length > 0,
			pages: getPagesForFolder(folder.path)
		}));
	}
</script>

<aside class="bg-primary border-border flex h-screen w-70 flex-col overflow-hidden border-r">
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
				onclick={() => createFolder('')}
				title="Create new folder"
			>
				<Plus class="h-4 w-4" />
			</Button>
		</div>
	</div>

	<!-- Search -->
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

	<!-- Folder Tree -->
	<div class="flex-1 overflow-y-auto">
		{#if isLoading}
			<div class="text-secondary flex items-center justify-center py-8 text-sm">
				Loading folders...
			</div>
		{:else if filteredFolders.length === 0}
			<div class="flex flex-col items-center justify-center px-4 py-8 text-center">
				{#if searchQuery.trim()}
					<p class="text-secondary text-sm">No folders match your search.</p>
				{:else}
					<p class="text-secondary mb-3 text-sm">No folders yet.</p>
					<Button variant="outline" size="sm" onclick={() => createFolder('')}>
						Create your first folder
					</Button>
				{/if}
			</div>
		{:else}
			<!-- Root link -->
			<div class="px-2 py-1">
				<a
					href="/folders"
					class="text-primary flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors {currentPath ===
					'/folders'
						? 'bg-blue-100 font-medium text-blue-700'
						: 'hover:bg-accent hover:text-accent-foreground'}"
				>
					<FolderOpen class="h-4 w-4" />
					<span>All Folders</span>
				</a>
			</div>
			<div class="px-2" >
			{#each getPagesForFolder("/") as page}
												<div style="margin-left: {1.5}rem;">
										<div class="flex items-center">
											<div class="h-5 w-5"></div>
											<a
												href="/pages/{page.metaData.slug}"
												class="text-primary hover:bg-accent hover:text-accent-foreground flex flex-1 items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors"
											>
												<File class="h-4 w-4 text-gray-500" />
												<span class="flex-1 truncate">{page.metaData?.title || 'Untitled'}</span>
											</a>
										</div>
									</div>
			{/each}
			</div>

			<!-- Folder tree -->
			<div class="px-2">
				{#each renderFolderTree(filteredFolders) as item (item.folder.path)}
					<div style="margin-left: {item.depth * 1.5}rem;">
						<div class="group flex items-center">
							<!-- Expand/collapse button -->
							{#if item.hasSubFolders}
								<Button
									variant="ghost"
									size="icon"
									class="h-5 w-5 p-0"
									onclick={() => toggleFolder(item.folder.path)}
								>
									<ChevronRight
										class="h-3 w-3 transition-transform {item.isExpanded ? 'rotate-90' : ''}"
									/>
								</Button>
							{:else}
								<div class="h-5 w-5"></div>
							{/if}

							<!-- Folder link -->
							<a
								href="/folders{item.folder.path}"
								class="flex flex-1 items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors {item.isCurrent
									? 'bg-blue-100 font-medium text-blue-700'
									: 'text-primary hover:bg-accent hover:text-accent-foreground'}"
							>
								<Folder class="h-4 w-4 text-blue-500" />
								<span class="flex-1 truncate">{item.folder.name}</span>
								<span class="text-secondary text-xs opacity-75">({item.folder.page_count})</span>
							</a>

							<!-- Create subfolder button -->
							<Button
								variant="ghost"
								size="icon"
								class="h-5 w-5 opacity-0 transition-opacity group-hover:opacity-100"
								onclick={() => createFolder(item.folder.path)}
								title="Create subfolder"
							>
								<Plus class="h-3 w-3" />
							</Button>
						</div>

						<!-- Render subfolders and files when expanded -->
						{#if item.isExpanded}
							<!-- Render files in current folder first -->
							{#if item.pages.length > 0}
								{#each item.pages as page (page.metaData?.slug || page.metaData?.path)}
									<div style="margin-left: {(item.depth + 1) * 1.5}rem;">
										<div class="flex items-center">
											<div class="h-5 w-5"></div>
											<a
												href="/pages{page.metaData?.path || `/${page.metaData?.slug}`}"
												class="text-primary hover:bg-accent hover:text-accent-foreground flex flex-1 items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors"
											>
												<File class="h-4 w-4 text-gray-500" />
												<span class="flex-1 truncate">{page.metaData?.title || 'Untitled'}</span>
											</a>
										</div>
									</div>
								{/each}
							{/if}
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>
</aside>

<!-- Create Folder Modal -->
<CreateFolderModal
	open={showCreateFolderModal}
	parentPath={parentPathForModal}
	onClose={() => {
		showCreateFolderModal = false;
		parentPathForModal = '';
	}}
	onCreated={handleFolderCreated}
/>
