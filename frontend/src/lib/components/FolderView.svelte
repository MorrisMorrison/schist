<script lang="ts">
	import { goto } from '$app/navigation';
	import { pagesStore, foldersStore, folderActions, pageActions } from '$lib/stores/pages';
	import PageGrid from './PageGrid.svelte';
	import Breadcrumbs from './Breadcrumbs.svelte';
	import CreateFolderModal from './CreateFolderModal.svelte';
	import { Plus, FolderPlus, File, Folder } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import {
		Card,
		CardContent,
		CardHeader,
		CardTitle,
		CardDescription
	} from '$lib/components/ui/card';
	import type { Page, Folder as FolderType } from '$lib/api/types';

	interface Props {
		path?: string;
		mode?: 'folder' | 'recent' | 'all';
		recentLimit?: number;
		showCreateButtons?: boolean;
		initialPages?: Page[];
		initialFolders?: FolderType[];
	}

	let {
		path = '',
		mode = 'folder',
		recentLimit = 10,
		showCreateButtons = true,
		initialPages = [],
		initialFolders = []
	}: Props = $props();

	let showCreateFolderModal = $state(false);
	let isLoadingFolderData = $state(false);
	let sortBy = $state<'name' | 'created' | 'modified'>(mode === 'recent' ? 'modified' : 'name'); // 'name', 'created', 'modified'
	let sortOrder = $state<'asc' | 'desc'>(mode === 'recent' ? 'desc' : 'asc'); // 'asc', 'desc'

	const currentFolderData = $derived(() => {
		const isRoot = path === '' || path === '/';
		if (isRoot) {
			const rootPageCount = $pagesStore.pages.filter((page) => {
				const pagePath = page.metaData?.path || '';
				return pagePath.split('/').length === 2; // ['', 'filename']
			}).length;

			return {
				name: 'Root',
				path: '/',
				created: new Date().toISOString(),
				page_count: rootPageCount,
				sub_folders:
					$foldersStore.folders?.filter((f) => {
						const segments = f.path.split('/').filter(Boolean);
						return segments.length === 1;
					}) || []
			};
		}
		return $foldersStore.folders?.find((f) => f.path === path);
	});
	const currentFolderPages = $derived(() => {
		if (mode === 'recent') {
			// Return recent pages sorted by modification date
			return $pagesStore.pages
				.filter((page) => !page.metaData.path.includes('/trash'))
				.sort((a, b) => {
					const dateA = new Date(a.metaData.updated || a.metaData.created || '').getTime();
					const dateB = new Date(b.metaData.updated || b.metaData.created || '').getTime();
					return dateB - dateA; // Newest first
				})
				.slice(0, recentLimit);
		} else if (mode === 'all') {
			// Return all pages
			return $pagesStore.pages.filter((page) => !page.metaData.path.includes('/trash'));
		} else {
			// Original folder filtering logic
			return $pagesStore.pages.filter((page) => {
				const pagePath = page.metaData?.path || '';
				const isRoot = path === '' || path === '/';
				if (isRoot) {
					// Pages in root folder don't have '/' after the first character
					return pagePath.split('/').length === 2; // ['', 'filename']
				}

				// check if page is directly in this folder
				const folderSegments = path.split('/').filter(Boolean);
				const pageSegments = pagePath.split('/').filter(Boolean);

				// Page must be exactly one level deeper than the folder
				return (
					pageSegments.length === folderSegments.length + 1 &&
					pageSegments.slice(0, folderSegments.length).join('/') === folderSegments.join('/')
				);
			});
		}
	});

	const subFolders = $derived(() => {
		if (mode === 'recent' || mode === 'all') {
			return []; // No folders in recent/all modes
		}
		return (currentFolderData()?.sub_folders || []).sort((a, b) => {
			const result = a.name.localeCompare(b.name);
			return sortOrder === 'desc' ? -result : result;
		});
	});

	// Load folder contents on mount and path changes
	$effect(() => {
		// Initialize stores with initial data if provided
		if (initialPages?.length > 0) {
			pagesStore.update((state) => ({ ...state, pages: initialPages }));
		}
		if (initialFolders?.length > 0) {
			foldersStore.update((state) => ({ ...state, folders: initialFolders }));
		}

		// Load fresh data if not provided
		if (initialPages?.length === 0 || initialFolders?.length === 0) {
			loadFolderData();
		}
	});

	async function loadFolderData() {
		try {
			isLoadingFolderData = true;
			await Promise.all([folderActions.loadFolderTree(), pageActions.loadPages()]);
		} catch (error) {
			console.error('Failed to load folder data:', error);
		} finally {
			isLoadingFolderData = false;
		}
	}

	function navigateToFolder(folderPath: string) {
		goto(`/folders${folderPath}`);
	}

	function navigateToNewPage(path: string) {
		goto(`/new${path}`);
	}

	async function handleFolderCreated() {
		showCreateFolderModal = false;
		await loadFolderData();
	}
</script>

<div class="mx-auto max-w-7xl space-y-8 p-6">
	{#if mode === 'folder'}
		<Breadcrumbs {path} />
	{/if}

	<!-- Folder Header -->
	<div
		class="border-border flex w-full flex-col items-start gap-6 border-b pb-8 md:flex-row md:items-start md:justify-between md:gap-8"
	>
		<div class="space-y-2">
			<h1 class="text-primary text-3xl font-bold">
				{#if mode === 'recent'}
					Recent Pages
				{:else if mode === 'all'}
					All Pages
				{:else if path === ''}
					root
				{:else}
					{(() => {
						const folderName = path.split('/').pop();
						if (!folderName) return 'Folder';
						return folderName.charAt(0).toUpperCase() + folderName.slice(1).replace(/-/g, ' ');
					})()}
				{/if}
			</h1>

			<!-- Statistics -->
			<div class="text-secondary flex items-center gap-2 text-sm">
				{#if mode === 'recent'}
					<span class="font-medium">
						{currentFolderPages().length > 0
							? `Showing ${currentFolderPages().length} of ${$pagesStore.pages.length} pages, sorted by most recent activity`
							: 'No pages found'}
					</span>
				{:else if mode === 'all'}
					<span class="font-medium">
						{currentFolderPages().length}
						{currentFolderPages().length === 1 ? 'page' : 'pages'} total
					</span>
				{:else}
					<span class="font-medium">
						{subFolders().length}
						{subFolders().length === 1 ? 'folder' : 'folders'}
					</span>
					<span class="text-muted">•</span>
					<span class="font-medium">
						{currentFolderPages().length}
						{currentFolderPages().length === 1 ? 'page' : 'pages'}
					</span>
				{/if}
			</div>

			{#if isLoadingFolderData}
				<div class="text-secondary flex items-center gap-2 text-sm">
					<div
						class="border-border border-t-primary h-4 w-4 animate-spin rounded-full border-2"
					></div>
					<span>Loading...</span>
				</div>
			{/if}
		</div>

		<div
			class="flex w-full flex-col items-start gap-2 md:w-auto md:flex-row md:items-center md:gap-4"
		>
			<!-- Sort Controls -->
			<div
				class="bg-secondary flex flex-wrap items-center gap-1 rounded-lg border p-2 md:flex-nowrap md:gap-2"
			>
				<label class="text-secondary text-sm font-medium" for="sort-select">Sort by:</label>
				<select
					bind:value={sortBy}
					class="bg-primary text-primary cursor-pointer rounded border px-2 py-1 text-sm"
					id="sort-select"
				>
					<option value="name">Name</option>
					<option value="created">Created</option>
					<option value="modified">Modified</option>
				</select>
				<Button
					variant="outline"
					size="sm"
					onclick={() => (sortOrder = sortOrder === 'asc' ? 'desc' : 'asc')}
					title={sortOrder === 'asc' ? 'Sort descending' : 'Sort ascending'}
				>
					{sortOrder === 'asc' ? '↑' : '↓'}
				</Button>
			</div>

			{#if showCreateButtons}
				<div class="flex w-full justify-start gap-2 md:w-auto">
					<Button variant="outline" onclick={() => (showCreateFolderModal = true)}>
						<FolderPlus class="h-4 w-4" />
						New Folder
					</Button>
					<Button variant="default" onclick={() => navigateToNewPage(path)}>
						<Plus class="h-4 w-4" />
						New Page
					</Button>
				</div>
			{/if}
		</div>
	</div>

	<!-- Content -->
	<Card class="border-border bg-card shadow-sm">
		<CardContent class="space-y-10 p-8">
			<!-- Subfolders -->
			{#if subFolders().length > 0}
				<section class="space-y-6">
					<h2 class="text-foreground text-xl font-semibold">Folders</h2>
					<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
						{#each subFolders() as folder (folder.path)}
							<Card
								class="group border-border bg-card hover:border-primary/20 hover:shadow-primary/5 cursor-pointer transition-all duration-200 hover:shadow-lg"
								onclick={() => navigateToFolder(folder.path)}
							>
								<CardHeader>
									<div class="flex items-start gap-4">
										<div
											class="bg-primary/90 group-hover:bg-primary/70 rounded-lg p-3 transition-colors"
										>
											<Folder class="text-primary h-5 w-5 flex-shrink-0" />
										</div>
										<div class="min-w-0 flex-1 space-y-1">
											<CardTitle class="truncate text-base leading-tight font-semibold"
												>{folder.name}</CardTitle
											>
											<CardDescription class="text-muted-foreground text-sm">
												{folder.page_count}
												{folder.page_count === 1 ? 'page' : 'pages'}
											</CardDescription>
										</div>
									</div>
								</CardHeader>
							</Card>
						{/each}
					</div>
				</section>
			{/if}

			<!-- Pages -->
			{#if currentFolderPages().length > 0}
				<section class="space-y-6">
					<h2 class="text-foreground text-xl font-semibold">Pages</h2>
					<PageGrid
						pages={currentFolderPages()}
						showPath={mode !== 'folder'}
						emptyMessage={mode === 'recent'
							? 'No recent activity yet. Create your first page to get started!'
							: mode === 'all'
								? 'No pages found. Create your first page to get started!'
								: 'This folder is empty. Create your first page to get started.'}
					/>
				</section>
			{/if}

			<!-- Empty State -->
			{#if subFolders().length === 0 && currentFolderPages().length === 0}
				<div class="flex flex-col items-center justify-center py-12 text-center">
					<File class="text-muted mb-4 h-12 w-12" />
					<h3 class="text-primary mb-2 text-lg font-medium">
						{#if mode === 'recent'}
							No recent activity
						{:else if mode === 'all'}
							No pages yet
						{:else if path === ''}
							Welcome to your documentation
						{:else}
							This folder is empty
						{/if}
					</h3>
					<p class="text-muted mb-6 max-w-md">
						{#if mode === 'recent'}
							Create or edit some pages to see recent activity here.
						{:else if mode === 'all'}
							Start building your knowledge base by creating your first page.
						{:else if path === ''}
							Start organizing your knowledge by creating your first page or folder.
						{:else}
							Add some content to this folder to get started.
						{/if}
					</p>
					{#if showCreateButtons}
						<div class="flex w-full justify-start gap-2 md:w-auto">
							<Button onclick={() => navigateToNewPage(path)}>
								<Plus class="h-4 w-4" />
								Create Page
							</Button>
							<Button variant="outline" onclick={() => (showCreateFolderModal = true)}>
								<FolderPlus class="h-4 w-4" />
								Create Folder
							</Button>
						</div>
					{/if}
				</div>
			{/if}
		</CardContent>
	</Card>
</div>

<CreateFolderModal
	open={showCreateFolderModal}
	parentPath={path}
	onClose={() => (showCreateFolderModal = false)}
	onCreated={handleFolderCreated}
/>
