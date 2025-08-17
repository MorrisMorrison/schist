<script lang="ts">
	import FolderContextMenu from './FolderContextMenu.svelte';
	import DocumentContextMenu from '../document/DocumentContextMenu.svelte';
	import type { Folder, Document } from '$lib/api/types.js';
	import { onMount } from 'svelte';

	interface Props {
		// Folder context menu
		folderMenuOpen?: string | null;
		folderMenuPosition?: { x: number; y: number };
		currentFolder?: Folder | null;

		// Document context menu
		documentMenuOpen?: string | null;
		documentMenuPosition?: { x: number; y: number };
		currentDocument?: Document | null;

		// Event handlers
		onClose?: () => void;
		onCreateFolder?: (parentPath: string) => void;
		onCreateDocument?: (parentPath: string) => void;
		onRenameFolder?: (folder: Folder) => void;
		onDeleteFolder?: (folder: Folder) => void;
		onFolderExport?: (folder: Folder) => void;
		onExportAll?: () => void;
		onRenameDocument?: (document: Document) => void;
		onDeleteDocument?: (document: Document) => void;
		onDocumentExport?: (document: Document) => void;
	}

	let {
		folderMenuOpen = null,
		folderMenuPosition = { x: 0, y: 0 },
		currentFolder = null,
		documentMenuOpen = null,
		documentMenuPosition = { x: 0, y: 0 },
		currentDocument = null,
		onClose,
		onCreateFolder,
		onCreateDocument,
		onRenameFolder,
		onDeleteFolder,
		onFolderExport,
		onExportAll,
		onRenameDocument,
		onDeleteDocument,
		onDocumentExport
	}: Props = $props();

	function handleClose() {
		onClose?.();
	}

	function handleCreateFolder(parentPath: string) {
		onCreateFolder?.(parentPath);
	}

	function handleCreateDocument(parentPath: string) {
		onCreateDocument?.(parentPath);
	}

	function handleRenameFolder(folder: Folder) {
		onRenameFolder?.(folder);
	}

	function handleDeleteFolder(folder: Folder) {
		onDeleteFolder?.(folder);
	}

	function handleFolderExport(folder: Folder) {
		if (folder.path === '/' && onExportAll) {
			onExportAll();
		} else if (onFolderExport) {
			onFolderExport(folder);
		}
	}

	function handleRenameDocument(document: Document) {
		onRenameDocument?.(document);
	}

	function handleDeleteDocument(document: Document) {
		onDeleteDocument?.(document);
	}

	function handleDocumentExport(document: Document) {
		onDocumentExport?.(document);
	}

	function handleOutsideClick() {
		handleClose();
	}

	onMount(() => {
		document.addEventListener('click', handleOutsideClick);
		return () => {
			document.removeEventListener('click', handleOutsideClick);
		};
	});
</script>

<svelte:window onclick={handleOutsideClick} />

<!-- Folder Context Menu -->
<FolderContextMenu
	folder={currentFolder}
	position={folderMenuPosition}
	isOpen={!!folderMenuOpen}
	onClose={handleClose}
	onCreateFolder={handleCreateFolder}
	onCreateDocument={handleCreateDocument}
	onRename={handleRenameFolder}
	onDelete={handleDeleteFolder}
	onFolderExport={onFolderExport ? handleFolderExport : undefined}
	{onExportAll}
/>

<!-- Document Context Menu -->
<DocumentContextMenu
	document={currentDocument}
	position={documentMenuPosition}
	isOpen={!!documentMenuOpen}
	onClose={handleClose}
	onRename={handleRenameDocument}
	onDelete={handleDeleteDocument}
	onExport={onDocumentExport ? handleDocumentExport : undefined}
/>
