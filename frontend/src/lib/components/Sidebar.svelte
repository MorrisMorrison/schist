<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import FolderTree from './FolderTree.svelte';
	import CreateFolderModal from './CreateFolderModal.svelte';
	import RenameFolderModal from './RenameFolderModal.svelte';
	import RenameDocumentModal from './RenameDocumentModal.svelte';
	import DeleteConfirmModal from './DeleteConfirmModal.svelte';
	import type { Folder as FolderType, Document } from '$lib/api/types';
	import { folderActions, documentActions } from '$lib/stores/documents';

	let showCreateFolderModal = $state(false);
	let parentPathForModal = $state('');
	let showRenameFolderModal = $state(false);
	let showDeleteFolderModal = $state(false);
	let folderToRename = $state<FolderType | undefined>(undefined);
	let folderToDelete = $state<FolderType | undefined>(undefined);
	let showRenameDocumentModal = $state(false);
	let showDeletePageModal = $state(false);
	let pageToRename = $state<Document | null>(null);
	let pageToDelete = $state<Document | null>(null);

	const currentPath = $derived(page.url.pathname);

	function handleFolderSelect(event: { path: string; folder: FolderType }) {
		goto(`/folders${event.path}`);
	}

	function handleDocumentSelect(event: { document: Document }) {
		const pagePath = event.document.metaData?.path || `/${event.document.metaData?.slug}`;
		goto(`/documents${pagePath}`);
	}

	function handleCreateFolder(event: { parentPath: string }) {
		parentPathForModal = event.parentPath;
		showCreateFolderModal = true;
	}

	function handleCreateDocument(event: { parentPath: string }) {
		const path = event.parentPath === '/' ? '/new' : `${event.parentPath}/new`;
		goto(path);
	}

	function handleFolderCreated() {
		showCreateFolderModal = false;
		parentPathForModal = '';
		folderActions.loadFolderTree();
	}

	async function handleDeleteFolder(event: { path: string; folder: FolderType }) {
		folderToDelete = event.folder;
		showDeleteFolderModal = true;
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

	function handlePageDelete(event: { document: Document }) {
		pageToDelete = event.document;
		showDeletePageModal = true;
	}

	function handlePageRename(event: { document: Document }) {
		pageToRename = event.document;
		showRenameDocumentModal = true;
	}

	async function confirmDeletePage() {
		if (pageToDelete?.metaData?.path) {
			try {
				await documentActions.deleteDocumentByPath(pageToDelete.metaData.path);
				showDeletePageModal = false;
				pageToDelete = null;
			} catch (error) {
				console.error('Failed to delete document:', error);
			}
		}
	}

	async function confirmDeleteFolder() {
		if (folderToDelete) {
			try {
				await folderActions.deleteFolder(folderToDelete.path);
				showDeleteFolderModal = false;
				folderToDelete = undefined;
			} catch (error) {
				console.error('Failed to delete folder:', error);
			}
		}
	}

	async function handlePageRenamed(oldPath: string, newPath: string) {
		showRenameDocumentModal = false;
		pageToRename = null;

		// Refresh the pages list
		await documentActions.loadDocuments();

		// Check if we're currently viewing the page that was renamed
		if (currentPath === `/documents${oldPath}`) {
			// Navigate to the new path
			goto(`/documents${newPath}`);
		}
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
			ondocumentselect={handleDocumentSelect}
			oncreate={handleCreateFolder}
			ondocumentcreate={handleCreateDocument}
			ondelete={handleDeleteFolder}
			onrename={handleRenameFolder}
			ondocumentdelete={handlePageDelete}
			ondocumentrename={handlePageRename}
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
	<RenameDocumentModal
		open={showRenameDocumentModal}
		document={pageToRename}
		onClose={() => {
			showRenameDocumentModal = false;
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

<!-- Delete Folder Modal -->
{#if folderToDelete}
	<DeleteConfirmModal
		open={showDeleteFolderModal}
		title="Delete Folder"
		description={`Are you sure you want to delete "${folderToDelete?.name || 'this page'}"? This action cannot be undone.`}
		onCancel={() => {
			showDeleteFolderModal = false;
			folderToDelete = undefined;
		}}
		onConfirm={confirmDeleteFolder}
	/>
{/if}
