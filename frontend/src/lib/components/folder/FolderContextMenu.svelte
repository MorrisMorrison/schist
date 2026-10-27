<script lang="ts">
	import { Plus, File, Download, Edit, Trash2 } from '@lucide/svelte';
	import type { Folder as FolderType } from '#lib/api/types.ts';
	import * as ContextMenu from '#lib/components/ui/context-menu/index.ts';

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

	// Choosing an item also closes the menu (through onOpenChange).
	function select(action: (folder: FolderType) => void) {
		if (folder) {
			action(folder);
		}
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
	<ContextMenu.Root open onOpenChange={(open) => !open && onClose()}>
		<!-- No scroll lock: a right-click on another row moves the menu there. -->
		<ContextMenu.Content
			{position}
			preventScroll={false}
			class="min-w-[180px]"
			aria-label="Folder actions"
			data-testid="context-menu"
		>
			<ContextMenu.Item onSelect={() => select((f) => onCreateFolder(f.path))}>
				<Plus />
				Create Subfolder
			</ContextMenu.Item>
			<ContextMenu.Item onSelect={() => select((f) => onCreateDocument(f.path))}>
				<File />
				Create Document
			</ContextMenu.Item>
			{#if showExport}
				<ContextMenu.Item onSelect={() => select(exportFolder)}>
					<Download />
					Export
				</ContextMenu.Item>
			{/if}
			{#if !isRootFolder}
				<ContextMenu.Item onSelect={() => select(onRename)}>
					<Edit />
					Rename
				</ContextMenu.Item>
				<ContextMenu.Separator />
				<ContextMenu.Item variant="destructive" onSelect={() => select(onDelete)}>
					<Trash2 />
					Delete
				</ContextMenu.Item>
			{/if}
		</ContextMenu.Content>
	</ContextMenu.Root>
{/if}
