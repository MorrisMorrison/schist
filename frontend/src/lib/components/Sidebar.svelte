<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import FolderTree from './FolderTree.svelte';
	import CreateFolderModal from './CreateFolderModal.svelte';
	import RenameFolderModal from './RenameFolderModal.svelte';
	import RenamePageModal from './RenamePageModal.svelte';
	import DeleteConfirmModal from './DeleteConfirmModal.svelte';
	import type { Folder as FolderType, Page } from '$lib/api/types';
	import { folderActions, pageActions } from '$lib/stores/pages';

	let showCreateFolderModal = $state(false);
	let parentPathForModal = $state('');
	let showRenameFolderModal = $state(false);
	let folderToRename = $state<FolderType | undefined>(undefined);
	let showRenamePageModal = $state(false);
	let showDeletePageModal = $state(false);
	let pageToRename = $state<Page | null>(null);
	let pageToDelete = $state<Page | null>(null);

	const currentPath = $derived(page.url.pathname);

	function handleFolderSelect(event: { path: string; folder: FolderType }) {
		goto(`/folders${event.path}`);
	}

	function handlePageSelect(event: { page: Page }) {
		const pagePath = event.page.metaData?.path || `/${event.page.metaData?.slug}`;
		goto(`/pages${pagePath}`);
	}

	function handleCreateFolder(event: { parentPath: string }) {
		parentPathForModal = event.parentPath;
		showCreateFolderModal = true;
	}

	function handleFolderCreated() {
		showCreateFolderModal = false;
		parentPathForModal = '';
		folderActions.loadFolderTree();
	}

	async function handleDeleteFolder(event: { path: string; folder: FolderType }) {
		try {
			await folderActions.deleteFolder(event.path);
		} catch (error) {
			console.error('Failed to delete folder:', error);
		}
	}

	function handleRenameFolder(event: { path: string; folder: FolderType }) {
		folderToRename = event.folder;
		showRenameFolderModal = true;
	}

	function handleFolderRenamed() {
		showRenameFolderModal = false;
		folderToRename = undefined;
		folderActions.loadFolderTree();
	}

	function handlePageDelete(event: { page: Page }) {
		pageToDelete = event.page;
		showDeletePageModal = true;
	}

	function handlePageRename(event: { page: Page }) {
		pageToRename = event.page;
		showRenamePageModal = true;
	}

	async function confirmDeletePage() {
		if (pageToDelete?.metaData?.path) {
			try {
				await pageActions.deletePageByPath(pageToDelete.metaData.path);
				showDeletePageModal = false;
				pageToDelete = null;
			} catch (error) {
				console.error('Failed to delete page:', error);
			}
		}
	}

	function handlePageRenamed() {
		showRenamePageModal = false;
		pageToRename = null;
		pageActions.loadPages();
	}
</script>

<aside class="bg-primary border-border flex h-full w-full flex-col overflow-hidden border-r">
	<div class="flex-1">
		<FolderTree
			{currentPath}
			showPages={true}
			showSearch={true}
			showActions={true}
			storageKey="sidebar-expanded-folders"
			onselect={handleFolderSelect}
			onpageselect={handlePageSelect}
			oncreate={handleCreateFolder}
			ondelete={handleDeleteFolder}
			onrename={handleRenameFolder}
			onpagedelete={handlePageDelete}
			onpagerename={handlePageRename}
		/>
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

<!-- Rename Folder Modal -->
<RenameFolderModal
	open={showRenameFolderModal}
	folder={folderToRename}
	onClose={() => {
		showRenameFolderModal = false;
		folderToRename = undefined;
	}}
	onRenamed={handleFolderRenamed}
/>

<!-- Rename Page Modal -->
{#if pageToRename}
	<RenamePageModal
		open={showRenamePageModal}
		page={pageToRename}
		onClose={() => {
			showRenamePageModal = false;
			pageToRename = null;
		}}
		onRenamed={handlePageRenamed}
	/>
{/if}

<!-- Delete Page Modal -->
{#if pageToDelete}
	<DeleteConfirmModal
		open={showDeletePageModal}
		title="Delete Page"
		description={`Are you sure you want to delete "${pageToDelete.metaData?.title || 'this page'}"? This action cannot be undone.`}
		onCancel={() => {
			showDeletePageModal = false;
			pageToDelete = null;
		}}
		onConfirm={confirmDeletePage}
	/>
{/if}
