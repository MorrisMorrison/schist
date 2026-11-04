// Recently opened documents, most recent first, kept in localStorage (per
// browser). Each entry records when the page was opened; older versions
// stored only the paths, which are still read (without a time).

const STORAGE_KEY = 'recent-documents';
const MAX_RECENT = 20;

export interface RecentDocument {
	path: string;
	/** ISO time the page was last opened; missing for entries from older versions. */
	openedAt?: string;
}

/** Recently opened documents, newest first. */
export function getRecentDocuments(): RecentDocument[] {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		const parsed: unknown = stored ? JSON.parse(stored) : [];
		if (!Array.isArray(parsed)) return [];
		return parsed.flatMap((entry): RecentDocument[] => {
			if (typeof entry === 'string') return [{ path: entry }];
			if (entry && typeof entry === 'object' && typeof entry.path === 'string') {
				return [
					typeof entry.openedAt === 'string'
						? { path: entry.path, openedAt: entry.openedAt }
						: { path: entry.path }
				];
			}
			return [];
		});
	} catch {
		return [];
	}
}

/** The paths of recently opened documents, newest first. */
export function getRecentDocumentPaths(): string[] {
	return getRecentDocuments().map((entry) => entry.path);
}

/** Records that path was just opened: it moves to the front, with the time. */
export function addToRecentDocuments(path: string): void {
	try {
		const recent = [
			{ path, openedAt: new Date().toISOString() },
			...getRecentDocuments().filter((entry) => entry.path !== path)
		].slice(0, MAX_RECENT);
		localStorage.setItem(STORAGE_KEY, JSON.stringify(recent));
	} catch (error) {
		console.error('Failed to update recent documents:', error);
	}
}
