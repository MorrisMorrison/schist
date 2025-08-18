<script lang="ts">
	import { authService } from '$lib/auth/auth-service';
	import { useOptimizedLoading } from '$lib/composables/useOptimizedLoading.svelte.js';
	import { useDragAndDrop } from '$lib/composables/useDragAndDrop.svelte.js';
	import {
		folders,
		isFoldersLoading,
		documentsStore,
		documentActions
	} from '$lib/stores/documents';
	import { folderActions } from '$lib/stores/documents';
	import type { Folder, Document } from '$lib/api/types.js';
	import { onDestroy } from 'svelte';

	interface Props {
		showPages?: boolean;
		storageKey?: string;
	}

	let { showPages = false, storageKey: _storageKey = 'folder-tree-expanded' }: Props = $props();

	const folderLoader = useOptimizedLoading(200, 150);
	const dragAndDrop = useDragAndDrop(showPages);

	let hasInitialized = $state(false);

	// Export function to get state instead of exporting derived
	export function getState() {
		return {
			folders: $folders || [],
			documents: $documentsStore.documents || [],
			isLoading: folderLoader.loading,
			dragAndDrop: {
				isDragging: dragAndDrop.isDragging,
				draggedItem: dragAndDrop.draggedItem,
				dropTarget: dragAndDrop.dropTarget,
				dragOverTarget: dragAndDrop.dragOverTarget,
				handleDragStart: dragAndDrop.handleDragStart,
				handleDragEnd: dragAndDrop.handleDragEnd,
				handleDragOver: dragAndDrop.handleDragOver,
				handleDragEnter: dragAndDrop.handleDragEnter,
				handleDragLeave: dragAndDrop.handleDragLeave,
				handleDrop: dragAndDrop.handleDrop
			}
		};
	}

	// Initialize data loading
	$effect(() => {
		const loadData = async () => {
			try {
				await authService.initialize();

				// Skip loading if auth is enabled but user is not authenticated
				if (authService.isAuthEnabled()) {
					const isAuthenticated = await authService.checkAuthStatus();
					if (!isAuthenticated) {
						return;
					}
				}

				// Only load on first initialization
				if (!hasInitialized) {
					folderLoader.startLoading();
					await folderActions.loadFolderTree();
					if (showPages) {
						await documentActions.loadDocuments();
					}
					hasInitialized = true;
				}
			} catch (error) {
				console.error('Failed to initialize FolderTreeManager:', error);
			}
		};

		loadData();
	});

	// Sync the optimized loader with the store's loading state
	$effect(() => {
		if ($isFoldersLoading) {
			folderLoader.startLoading();
		} else {
			folderLoader.stopLoading();
		}
	});

	onDestroy(() => {
		folderLoader.cleanup();
	});

	/**
	 * Find a folder by path in the folder tree
	 */
	export function findFolderByPath(folders: Folder[], path: string): Folder | null {
		for (const folder of folders) {
			if (folder.path === path) {
				return folder;
			}
			if (folder.sub_folders) {
				const found = findFolderByPath(folder.sub_folders, path);
				if (found) return found;
			}
		}
		return null;
	}

	/**
	 * Find a document by path
	 */
	export function findDocumentByPath(path: string): Document | null {
		const documents = $documentsStore.documents || [];
		return documents.find((doc) => doc.metaData?.path === path) || null;
	}

	/**
	 * Get current folder from path
	 */
	export function getCurrentFolderFromPath(path: string): Folder | null {
		if (path === '/') {
			return {
				name: '/',
				path: '/',
				created: new Date().toISOString(),
				document_count: 0, // Will be calculated by parent
				sub_folders: $folders || []
			};
		}
		return findFolderByPath($folders || [], path);
	}

	/**
	 * Check if a path is the current path
	 */
	export function isCurrentPath(path: string, currentPath: string): boolean {
		if (path === '/') {
			return currentPath === path || currentPath === '/folders';
		}
		return currentPath === `/folders${path}` || currentPath === `/folders${path}/`;
	}
</script>
