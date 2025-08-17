import type { Folder, Document } from '$lib/api/types.js';

export interface ParsedQuery {
	textQuery: string;
	tagFilters: string[];
}

/**
 * Manages folder tree filtering and search functionality
 */
export class FolderTreeFiltering {
	/**
	 * Parse a unified search query into text and tag components
	 */
	parseUnifiedQuery(query: string): ParsedQuery {
		const words = query.split(/\s+/);
		const textParts: string[] = [];
		const tagFilters: string[] = [];

		for (const word of words) {
			if (word.toLowerCase().startsWith('tag:')) {
				const tagName = word.substring(4).toLowerCase();
				if (tagName) tagFilters.push(tagName);
			} else if (word.trim()) {
				textParts.push(word.toLowerCase());
			}
		}

		return {
			textQuery: textParts.join(' '),
			tagFilters
		};
	}

	/**
	 * Check if a document matches the given filters
	 */
	pageMatchesFilters(document: Document, textQuery: string, tagFilters: string[]): boolean {
		// Check text match in page title
		const textMatch = !textQuery || document.metaData.title.toLowerCase().includes(textQuery);

		// Check tag matches (AND logic - must match all specified tags with prefix matching)
		const tagMatch =
			tagFilters.length === 0 ||
			Boolean(
				document.metaData.tags &&
					tagFilters.every((requiredTag) =>
						document.metaData.tags!.some((pageTag) => pageTag.toLowerCase().startsWith(requiredTag))
					)
			);

		return textMatch && tagMatch;
	}

	/**
	 * Filter folders and pages based on search query
	 */
	filterFoldersAndPages(
		folders: Folder[],
		allDocuments: Document[],
		query: string,
		getPagesForFolder: (folderPath: string) => Document[]
	): Folder[] {
		const { textQuery, tagFilters } = this.parseUnifiedQuery(query);

		const filterFolderRecursive = (folder: Folder): Folder | null => {
			const folderNameMatches = !textQuery || folder.name.toLowerCase().includes(textQuery);

			const folderPages = getPagesForFolder(folder.path);
			const matchingPages = folderPages.filter((page) =>
				this.pageMatchesFilters(page, textQuery, tagFilters)
			);

			const filteredSubFolders =
				folder.sub_folders?.map(filterFolderRecursive)?.filter((f): f is Folder => f !== null) ||
				[];

			const shouldInclude =
				folderNameMatches || matchingPages.length > 0 || filteredSubFolders.length > 0;

			if (shouldInclude) {
				return {
					...folder,
					sub_folders: filteredSubFolders,
					document_count: matchingPages.length
				};
			}

			return null;
		};

		return folders.map(filterFolderRecursive).filter((f): f is Folder => f !== null);
	}

	/**
	 * Get pages for a specific folder path
	 */
	getPagesForFolder(folderPath: string, documents: Document[]): Document[] {
		return documents.filter((page) => {
			const pagePath = page.metaData?.path || '';

			if (folderPath === '' || folderPath === '/') {
				return pagePath.split('/').length === 2;
			}

			const folderSegments = folderPath.split('/').filter(Boolean);
			const pageSegments = pagePath.split('/').filter(Boolean);

			return (
				pageSegments.length === folderSegments.length + 1 &&
				pageSegments.slice(0, folderSegments.length).join('/') === folderSegments.join('/')
			);
		});
	}

	/**
	 * Get filtered pages for a folder with search applied
	 */
	getFilteredPagesForFolder(folderPath: string, documents: Document[], query: string): Document[] {
		const folderPages = this.getPagesForFolder(folderPath, documents);

		if (!query.trim()) {
			return folderPages;
		}

		const { textQuery, tagFilters } = this.parseUnifiedQuery(query.toLowerCase());
		return folderPages.filter((page) => this.pageMatchesFilters(page, textQuery, tagFilters));
	}

	/**
	 * Get filtered root pages
	 */
	getFilteredRootPages(documents: Document[], query: string): Document[] {
		const rootPages = this.getPagesForFolder('/', documents);

		if (!query.trim()) {
			return rootPages;
		}

		const { textQuery, tagFilters } = this.parseUnifiedQuery(query.toLowerCase());
		return rootPages.filter((page) => this.pageMatchesFilters(page, textQuery, tagFilters));
	}
}

/**
 * Create a new folder tree filtering instance
 */
export function createFolderTreeFiltering(): FolderTreeFiltering {
	return new FolderTreeFiltering();
}
