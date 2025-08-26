import type { Folder as FolderType, Document } from '$lib/api/types';
import { folderActions, documentActions } from '$lib/stores/documents.svelte';

export interface DragItem {
	type: 'folder' | 'page';
	path: string;
	data: FolderType | Document;
}

export function useDragAndDrop(showPages: boolean) {
	let draggedItem = $state<DragItem | null>(null);
	let dropTarget = $state<string | null>(null);
	let isDragging = $state(false);
	let dragOverTarget = $state<string | null>(null);

	function handleDragStart(
		event: DragEvent,
		type: 'folder' | 'page',
		path: string,
		data: FolderType | Document
	) {
		if (!event.dataTransfer) return;

		draggedItem = { type, path, data };
		isDragging = true;

		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData('application/json', JSON.stringify({ type, path, data }));

		if (event.target instanceof HTMLElement) {
			const dragImage = event.target.cloneNode(true) as HTMLElement;
			dragImage.style.opacity = '0.7';
			event.dataTransfer.setDragImage(dragImage, 0, 0);
		}
	}

	function handleDragEnd() {
		draggedItem = null;
		isDragging = false;
		dropTarget = null;
		dragOverTarget = null;
	}

	function handleDragOver(event: DragEvent, targetPath: string) {
		if (!draggedItem || draggedItem.path === targetPath) return;

		if (draggedItem.type === 'folder' && targetPath.startsWith(draggedItem.path + '/')) {
			return;
		}

		event.preventDefault();
		event.dataTransfer!.dropEffect = 'move';
		dragOverTarget = targetPath;
	}

	function handleDragEnter(event: DragEvent, targetPath: string) {
		if (!draggedItem || draggedItem.path === targetPath) return;

		if (draggedItem.type === 'folder' && targetPath.startsWith(draggedItem.path + '/')) {
			return;
		}

		event.preventDefault();
		dropTarget = targetPath;
	}

	function handleDragLeave(event: DragEvent, targetPath: string) {
		if (event.currentTarget === event.target) {
			if (dropTarget === targetPath) {
				dropTarget = null;
			}
			if (dragOverTarget === targetPath) {
				dragOverTarget = null;
			}
		}
	}

	async function handleDrop(event: DragEvent, targetPath: string) {
		event.preventDefault();

		if (!draggedItem) return;

		const { type, path: sourcePath } = draggedItem;

		if (sourcePath === targetPath) return;

		if (type === 'folder' && targetPath.startsWith(sourcePath + '/')) {
			return;
		}

		try {
			const sourcePathSegments = sourcePath.split('/').filter(Boolean);
			const itemName = sourcePathSegments[sourcePathSegments.length - 1];
			const newPath = targetPath === '/' ? `/${itemName}` : `${targetPath}/${itemName}`;

			if (type === 'folder') {
				await folderActions.moveFolder(sourcePath, newPath);
			} else {
				await documentActions.moveDocumentPath(sourcePath, newPath);
			}

			await folderActions.loadFolderTree();
			if (showPages) {
				await documentActions.loadDocuments();
			}
		} catch (error) {
			console.error('Failed to move item:', error);
		} finally {
			draggedItem = null;
			isDragging = false;
			dropTarget = null;
			dragOverTarget = null;
		}
	}

	return {
		get draggedItem() {
			return draggedItem;
		},
		get dropTarget() {
			return dropTarget;
		},
		get isDragging() {
			return isDragging;
		},
		get dragOverTarget() {
			return dragOverTarget;
		},
		handleDragStart,
		handleDragEnd,
		handleDragOver,
		handleDragEnter,
		handleDragLeave,
		handleDrop
	};
}
