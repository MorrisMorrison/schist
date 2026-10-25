<script lang="ts">
	import { Plus, File, Download, Edit, Trash2 } from '@lucide/svelte';
	import type { Folder as FolderType } from '$lib/api/types.js';
	import ContextMenu from '../context-menu/ContextMenu.svelte';
	import ContextMenuItem from '../context-menu/ContextMenuItem.svelte';

	interface Props {
		folder: FolderType | null;
		position: { x: number; y: number };
		isOpen: boolean;
		onClose: () => void;
		onCreateFolder: (parentPath: string) => void;
		onCreateDocument: (parentPath: string) => void;
		onRename: (folder: FolderType) => void;
		onDelete: (folder: FolderType) => void;
		onFolderExport?: (folder: FolderType) => void;
		onExportAll?: () => void;
	}

	let {
		folder,
		position,
		isOpen,
		onClose,
		onCreateFolder,
		onCreateDocument,
		onRename,
		onDelete,
		onFolderExport,
		onExportAll
	}: Props = $props();

	const isRootFolder = $derived(folder?.path === '/' || folder?.path === '');
	const showExport = $derived(onFolderExport || onExportAll);

	function select(action: (folder: FolderType) => void) {
		if (folder) {
			action(folder);
		}
		onClose();
	}

	function exportFolder(folder: FolderType) {
		if (isRootFolder && onExportAll) {
			onExportAll();
		} else if (onFolderExport) {
			onFolderExport(folder);
		}
	}
</script>

{#if isOpen && folder}
	<ContextMenu
		{position}
		{onClose}
		class="min-w-[180px]"
		aria-label="Folder actions"
		data-testid="context-menu"
	>
		<ContextMenuItem
			icon={Plus}
			label="Create Subfolder"
			onclick={() => select((f) => onCreateFolder(f.path))}
		/>
		<ContextMenuItem
			icon={File}
			label="Create Document"
			onclick={() => select((f) => onCreateDocument(f.path))}
		/>
		{#if showExport}
			<ContextMenuItem icon={Download} label="Export" onclick={() => select(exportFolder)} />
		{/if}
		{#if !isRootFolder}
			<ContextMenuItem icon={Edit} label="Rename" onclick={() => select(onRename)} />
			<ContextMenuItem icon={Trash2} label="Delete" destructive onclick={() => select(onDelete)} />
		{/if}
	</ContextMenu>
{/if}
