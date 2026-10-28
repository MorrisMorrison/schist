// Recently opened documents, most recent first, kept in localStorage.

/**
 * Extract recent documents from localStorage
 */
export function getRecentDocumentPaths(): string[] {
	try {
		const stored = localStorage.getItem('recent-documents');
		return stored ? JSON.parse(stored) : [];
	} catch {
		return [];
	}
}

/**
 * Add document to recent list
 */
export function addToRecentDocuments(path: string): void {
	try {
		let recent = getRecentDocumentPaths();

		// Remove if already exists and add to front
		recent = recent.filter((p) => p !== path);
		recent.unshift(path);

		// Keep only last 20
		recent = recent.slice(0, 20);

		localStorage.setItem('recent-documents', JSON.stringify(recent));
	} catch (error) {
		console.error('Failed to update recent documents:', error);
	}
}
