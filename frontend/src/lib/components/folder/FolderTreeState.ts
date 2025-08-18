import { browser } from '$app/environment';
import type { Folder } from '$lib/api/types.js';

/**
 * Manages folder tree expansion state with localStorage persistence
 */
export class FolderTreeState {
	private expandedFolders = $state<Set<string>>(new Set(['/']));
	private userCollapsedFolders = $state<Set<string>>(new Set());
	private storageKey: string;

	constructor(storageKey: string = 'folder-tree-expanded') {
		this.storageKey = storageKey;
		this.loadFromStorage();
	}

	/**
	 * Get the current set of expanded folders
	 */
	get expanded(): Set<string> {
		return this.expandedFolders;
	}

	/**
	 * Get the set of folders manually collapsed by user
	 */
	get userCollapsed(): Set<string> {
		return this.userCollapsedFolders;
	}

	/**
	 * Check if a folder is currently expanded
	 */
	isExpanded(path: string): boolean {
		return this.expandedFolders.has(path);
	}

	/**
	 * Check if a folder was manually collapsed by user
	 */
	isUserCollapsed(path: string): boolean {
		return this.userCollapsedFolders.has(path);
	}

	/**
	 * Refresh a Set to trigger reactivity (private helper)
	 */
	private _refreshSet<T>(set: Set<T>): Set<T> {
		return new Set(set);
	}

	/**
	 * Toggle expansion state of a folder
	 */
	toggleExpanded(path: string): void {
		if (this.expandedFolders.has(path)) {
			this.expandedFolders.delete(path);
			this.userCollapsedFolders.add(path);
		} else {
			this.expandedFolders.add(path);
			this.userCollapsedFolders.delete(path);
		}

		this.expandedFolders = this._refreshSet(this.expandedFolders);
		this.userCollapsedFolders = this._refreshSet(this.userCollapsedFolders);

		this.saveToStorage();
	}

	/**
	 * Expand a specific folder (if not already expanded)
	 */
	expandFolder(path: string): void {
		if (!this.expandedFolders.has(path)) {
			this.expandedFolders.add(path);
			this.expandedFolders = this._refreshSet(this.expandedFolders);
			this.saveToStorage();
		}
	}

	/**
	 * Expand all folders in the tree
	 */
	expandAll(folders: Folder[], includePagesRoot: boolean = false): void {
		const getAllFolderPaths = (folderList: Folder[]): string[] => {
			let paths: string[] = [];
			for (const folder of folderList) {
				paths.push(folder.path);
				if (folder.sub_folders) {
					paths = paths.concat(getAllFolderPaths(folder.sub_folders));
				}
			}
			return paths;
		};

		const allPaths = getAllFolderPaths(folders);
		if (includePagesRoot) {
			allPaths.push('/');
		}

		this.expandedFolders = new Set(allPaths);
		this.saveToStorage();
	}

	/**
	 * Collapse all folders
	 */
	collapseAll(): void {
		this.expandedFolders = new Set();
		this.saveToStorage();
	}

	/**
	 * Load expansion state from localStorage
	 */
	private loadFromStorage(): void {
		if (browser && this.storageKey) {
			const savedExpanded = localStorage.getItem(this.storageKey);
			if (savedExpanded) {
				try {
					this.expandedFolders = new Set(JSON.parse(savedExpanded));
				} catch (e) {
					console.warn('Failed to parse saved expanded folders:', e);
				}
			}
		}
	}

	/**
	 * Save expansion state to localStorage
	 */
	private saveToStorage(): void {
		if (browser && this.storageKey) {
			localStorage.setItem(this.storageKey, JSON.stringify([...this.expandedFolders]));
		}
	}
}

/**
 * Create a new folder tree state manager
 */
export function createFolderTreeState(storageKey?: string): FolderTreeState {
	return new FolderTreeState(storageKey);
}
