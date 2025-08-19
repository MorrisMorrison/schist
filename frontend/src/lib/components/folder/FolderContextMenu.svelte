<script lang="ts">
	import { Plus, File, Download, Edit, Trash2 } from '@lucide/svelte';
	import type { Folder as FolderType } from '$lib/api/types.js';

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

	function handleCreateFolder() {
		if (folder) {
			onCreateFolder(folder.path);
		}
		onClose();
	}

	function handleCreateDocument() {
		if (folder) {
			onCreateDocument(folder.path);
		}
		onClose();
	}

	function handleRename() {
		if (folder) {
			onRename(folder);
		}
		onClose();
	}

	function handleDelete() {
		if (folder) {
			onDelete(folder);
		}
		onClose();
	}

	function handleExport() {
		if (folder) {
			if (isRootFolder && onExportAll) {
				onExportAll();
			} else if (onFolderExport) {
				onFolderExport(folder);
			}
		}
		onClose();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			onClose();
		}
	}
</script>

{#if isOpen && folder}
	<div
		class="bg-primary border-primary fixed z-50 min-w-[180px] rounded-lg border py-1 shadow-lg"
		style="left: {position.x}px; top: {position.y}px"
		onclick={(e) => e.stopPropagation()}
		onkeydown={handleKeydown}
		role="menu"
		aria-label="Folder actions"
		data-testid="context-menu"
		tabindex="-1"
	>
		<button
			type="button"
			class="hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
			onclick={handleCreateFolder}
		>
			<Plus class="h-4 w-4" />
			Create Subfolder
		</button>

		<button
			type="button"
			class="hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
			onclick={handleCreateDocument}
		>
			<File class="h-4 w-4" />
			Create Document
		</button>

		{#if showExport}
			<button
				type="button"
				class="hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
				onclick={handleExport}
			>
				<Download class="h-4 w-4" />
				Export
			</button>
		{/if}

		{#if !isRootFolder}
			<button
				type="button"
				class="hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
				onclick={handleRename}
			>
				<Edit class="h-4 w-4" />
				Rename
			</button>

			<button
				type="button"
				class="text-destructive hover:bg-destructive/10 flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors"
				onclick={handleDelete}
			>
				<Trash2 class="h-4 w-4" />
				Delete
			</button>
		{/if}
	</div>
{/if}
