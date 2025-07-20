<script lang="ts">
	import { goto } from '$app/navigation';
	import { pagesStore, foldersStore, folderActions, pageActions } from '$lib/stores/pages';
	import PageCard from './PageCard.svelte';
	import Breadcrumbs from './Breadcrumbs.svelte';
	import CreateFolderModal from './CreateFolderModal.svelte';
	import DeleteConfirmModal from './DeleteConfirmModal.svelte';
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
		showCreateButtons?: boolean;
		initialPages?: Page[];
		initialFolders?: FolderType[];
	}

	let {
		path = '',
		showCreateButtons = true,
		initialPages = [],
		initialFolders = []
	}: Props = $props();

	let showCreateFolderModal = $state(false);
	let isLoadingFolderData = $state(false);
	let sortBy = $state('name'); // 'name', 'created', 'modified'
	let sortOrder = $state('asc'); // 'asc', 'desc'
	let deleteDialogOpen = $state(false);
	let pageToDelete = $state<string | null>(null);
	let isDeleting = $state(false);

	// Get current folder and its contents
	const currentFolderData = $derived($foldersStore.folders?.find((f) => f.path === path));
	const currentFolderPages = $derived(
		$pagesStore.pages
			.filter((page) => {
				const pagePath = page.metaData?.path || '';

				// Handle root folder case
				if (path === '' || path === '/') {
					// Pages in root folder don't have '/' after the first character
					return pagePath.split('/').length === 2; // ['', 'filename']
				}

				// For specific folders, check if page is directly in this folder
				// e.g., for folder '/anotherfolder', match pages like '/anotherfolder/page'
				// but not '/anotherfolder/subfolder/page'
				const folderSegments = path.split('/').filter(Boolean);
				const pageSegments = pagePath.split('/').filter(Boolean);

				// Page must be exactly one level deeper than the folder
				return (
					pageSegments.length === folderSegments.length + 1 &&
					pageSegments.slice(0, folderSegments.length).join('/') === folderSegments.join('/')
				);
			})
			.sort((a, b) => {
				let result = 0;

				if (sortBy === 'name') {
					result = (a.metaData.title || '').localeCompare(b.metaData.title || '');
				} else if (sortBy === 'created') {
					const dateA = new Date(a.metaData.created || '').getTime();
					const dateB = new Date(b.metaData.created || '').getTime();
					result = dateB - dateA; // Newest first by default
				} else if (sortBy === 'modified') {
					const dateA = new Date(a.metaData.updated || a.metaData.created || '').getTime();
					const dateB = new Date(b.metaData.updated || b.metaData.created || '').getTime();
					result = dateB - dateA; // Newest first by default
				}

				return sortOrder === 'desc' ? -result : result;
			})
	);

	const subFolders = $derived(
		(currentFolderData?.sub_folders || []).sort((a, b) => {
			const result = a.name.localeCompare(b.name);
			return sortOrder === 'desc' ? -result : result;
		})
	);

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

	// Navigate to subfolder
	function navigateToFolder(folderPath: string) {
		goto(`/folders${folderPath}`);
	}

	// Navigate to page
	function navigateToPage(pagePath: string) {
		goto(`/pages${pagePath}`);
	}

	function navigateToNewPage(path: string) {
		goto(`/new${path}`);
	}

	// Navigate to edit page
	function navigateToEditPage(path: string) {
		goto(`/edit${path}`);
	}

	function handleDeletePage(slug: string) {
		pageToDelete = slug;
		deleteDialogOpen = true;
	}

	async function confirmDelete() {
		if (!pageToDelete) return;

		try {
			isDeleting = true;
			await pageActions.deletePage(pageToDelete);
			deleteDialogOpen = false;
			pageToDelete = null;
		} catch (err) {
			console.error('Failed to delete page:', err);
		} finally {
			isDeleting = false;
		}
	}

	function cancelDelete() {
		deleteDialogOpen = false;
		pageToDelete = null;
		isDeleting = false;
	}

	// Create new page in current folder
	// async function createPage() {
	// if (!newPageTitle.trim()) return;

	// const slug = newPageTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-');
	// const pagePath = path ? `${path}/${slug}` : `/${slug}`;

	// try {
	// 	await pageActions.createPage({
	// 		metaData: {
	// 			title: newPageTitle,
	// 			path: pagePath,
	// 			tags: []
	// 		},
	// 		content: `# ${newPageTitle}\n\nStart writing your content here...`
	// 	});
	// 	newPageTitle = '';
	// 	showCreatePageModal = false;
	// Navigate to the new page
	// goto(`/new${pagePath}`);
	// } catch (error) {
	// 	console.error('Failed to create page:', error);
	// }
	// }

	// Handle folder creation
	async function handleFolderCreated() {
		showCreateFolderModal = false;
		await loadFolderData();
	}
</script>

<div class="mx-auto max-w-7xl space-y-8 p-6">
	<!-- Breadcrumbs -->
	<Breadcrumbs {path} />

	<!-- Folder Header -->
	<div
		class="flex w-full flex-col items-start gap-4 border-b pb-6 md:flex-row md:items-start md:justify-between md:gap-6"
	>
		<div class="space-y-2">
			<h1 class="text-primary text-3xl font-bold">
				{#if path === ''}
					All Pages
				{:else}
					{(() => {
						const folderName = path.split('/').pop();
						if (!folderName) return 'Folder';
						return folderName.charAt(0).toUpperCase() + folderName.slice(1).replace(/-/g, ' ');
					})()}
				{/if}
			</h1>

			<!-- Folder Statistics -->
			<div class="text-secondary flex items-center gap-2 text-sm">
				<span class="font-medium">
					{subFolders.length}
					{subFolders.length === 1 ? 'folder' : 'folders'}
				</span>
				<span class="text-muted">•</span>
				<span class="font-medium">
					{currentFolderPages.length}
					{currentFolderPages.length === 1 ? 'page' : 'pages'}
				</span>
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

	<!-- Folder Contents -->
	<Card class="p-6">
		<CardContent class="space-y-8">
			<!-- Subfolders -->
			{#if subFolders.length > 0}
				<section class="space-y-4">
					<h2 class="text-primary text-lg font-medium">Folders</h2>
					<div
						class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4 sm:grid-cols-1 md:grid-cols-[repeat(auto-fill,minmax(280px,1fr))]"
					>
						{#each subFolders as folder (folder.path)}
							<Card
								class="cursor-pointer transition-shadow hover:shadow-md"
								onclick={() => navigateToFolder(folder.path)}
							>
								<CardHeader class="pb-3">
									<div class="flex items-center gap-3">
										<Folder class="h-5 w-5 flex-shrink-0 text-blue-500" />
										<div class="min-w-0 flex-1">
											<CardTitle class="truncate text-base font-semibold">{folder.name}</CardTitle>
											<CardDescription class="text-sm">
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
			{#if currentFolderPages.length > 0}
				<section class="space-y-4">
					<h2 class="text-primary text-lg font-medium">Pages</h2>
					<div
						class="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4 sm:grid-cols-1 md:grid-cols-[repeat(auto-fill,minmax(320px,1fr))]"
					>
						{#each currentFolderPages as page (page.metaData.slug)}
							<PageCard
								{page}
								showPath={false}
								onView={navigateToPage}
								onEdit={navigateToEditPage}
								onDelete={handleDeletePage}
							/>
						{/each}
					</div>
				</section>
			{/if}

			<!-- Empty State -->
			{#if subFolders.length === 0 && currentFolderPages.length === 0}
				<div class="flex flex-col items-center justify-center py-12 text-center">
					<File class="text-muted mb-4 h-12 w-12" />
					<h3 class="text-primary mb-2 text-lg font-medium">
						{#if path === ''}
							Welcome to your documentation
						{:else}
							This folder is empty
						{/if}
					</h3>
					<p class="text-muted mb-6 max-w-md">
						{#if path === ''}
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
<!-- Delete Confirmation Modal -->
<DeleteConfirmModal
	open={deleteDialogOpen}
	{isDeleting}
	onConfirm={confirmDelete}
	onCancel={cancelDelete}
/>

<!-- Create Folder Modal -->
<CreateFolderModal
	open={showCreateFolderModal}
	parentPath={path}
	onClose={() => (showCreateFolderModal = false)}
	onCreated={handleFolderCreated}
/>

<!-- Create Page Modal -->
<!-- <Dialog open={showCreatePageModal} onOpenChange={(open) => (showCreatePageModal = open)}>
	<DialogContent>
		<DialogHeader>
			<DialogTitle>Create New Page</DialogTitle>
		</DialogHeader>
		<form
			onsubmit={(e) => {
				e.preventDefault();
				createPage();
			}}
			class="space-y-4"
		>
			<div class="space-y-2">
				<label for="page-title" class="text-primary text-sm font-medium">Page Title</label>
				<Input
					id="page-title"
					type="text"
					bind:value={newPageTitle}
					placeholder="Enter page title"
					required
				/>
			</div>
			<DialogFooter>
				<Button type="button" variant="outline" onclick={() => (showCreatePageModal = false)}>
					Cancel
				</Button>
				<Button type="submit" disabled={!newPageTitle.trim()}>Create Page</Button>
			</DialogFooter>
		</form>
	</DialogContent>
</Dialog> -->
