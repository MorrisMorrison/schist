<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import FolderTree from './folder/FolderTree.svelte';
	import CreateFolderModal from './modal/CreateFolderModal.svelte';
	import RenameFolderModal from './modal/RenameFolderModal.svelte';
	import RenameDocumentModal from './modal/RenameDocumentModal.svelte';
	import DeleteConfirmModal from './modal/DeleteConfirmModal.svelte';
	import ImportDocumentsModal from './modal/ImportDocumentsModal.svelte';
	import type { Folder as FolderType, Document } from '$lib/api/types';
	import { folderActions, documentActions, foldersStore } from '$lib/stores/documents.svelte';
	import { apiClient } from '$lib/api/client';
	import { Button } from './ui/button';
	import { onMount } from 'svelte';

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
	let showImportModal = $state(false);

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
		const path = event.parentPath === '/' ? '/new' : `/new${event.parentPath}`;
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

		await documentActions.loadDocuments();

		if (currentPath === `/documents${oldPath}`) {
			goto(`/documents${newPath}`);
		}
	}

	function handleImportDocuments() {
		showImportModal = true;
	}

	function handleImportSuccess() {
		showImportModal = false;
	}

	function handleImportClose() {
		showImportModal = false;
	}

	function handleFolderExport(event: { path: string; folder: FolderType }) {
		apiClient.exportFolder(event.path);
	}

	function handleDocumentExport(event: { path: string; document: Document }) {
		apiClient.exportDocument(event.path);
	}

	function handleExportAll() {
		apiClient.exportAll();
	}

	onMount(() => {
		function handleGlobalCreateFolder() {
			handleCreateFolder({
				parentPath: currentPath.startsWith('/folders') ? currentPath.replace('/folders', '') : '/'
			});
		}

		window.addEventListener('openCreateFolderModal', handleGlobalCreateFolder);

		return () => {
			window.removeEventListener('openCreateFolderModal', handleGlobalCreateFolder);
		};
	});
</script>

<aside class="bg-primary border-border flex h-full w-full flex-col overflow-hidden border-r">
	<div class="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
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
			onfolderexport={handleFolderExport}
			ondocumentexport={handleDocumentExport}
			onexportall={handleExportAll}
		/>
	</div>

	<div class="border-border flex-shrink-0 border-t p-4">
		<Button onclick={handleImportDocuments} class="w-full">
			<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
				/>
			</svg>
			Import Documents
		</Button>
	</div>
</aside>

<CreateFolderModal
	open={showCreateFolderModal}
	parentPath={parentPathForModal}
	onClose={() => {
		showCreateFolderModal = false;
		parentPathForModal = '';
	}}
	onCreated={handleFolderCreated}
/>

<RenameFolderModal
	open={showRenameFolderModal}
	folder={folderToRename}
	onClose={() => {
		showRenameFolderModal = false;
		folderToRename = undefined;
	}}
	onRenamed={handleFolderRenamed}
/>

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

<ImportDocumentsModal
	open={showImportModal}
	folders={foldersStore.folders}
	onClose={handleImportClose}
	onSuccess={handleImportSuccess}
/>
