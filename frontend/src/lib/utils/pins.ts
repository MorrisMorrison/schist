// Pinned pages. Schist is one shared workspace with no per-user settings on
// the server, so a pin is a page property: `pinned: true` in the page's front
// matter. Everyone sees the same pins, they're kept in git and the GitHub
// backup, and AI assistants can set them through the MCP properties tools.

import { apiClient } from '#lib/api/client.ts';
import type { Document, DocumentSummary } from '#lib/api/types.ts';

type Pinnable = Pick<DocumentSummary, 'metaData'>;

export function isPinned(document: Pinnable): boolean {
	const value = document.metaData?.properties?.pinned;
	return value === true || value === 'true';
}

/**
 * Compares names the way people read them: ignoring case, and with numbers in
 * order ("Service 2" before "Service 10").
 */
export function compareNames(a: string, b: string): number {
	return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
}

/** The pinned pages, sorted by title. */
export function pinnedDocuments<T extends Pinnable>(documents: readonly T[]): T[] {
	return documents
		.filter(isPinned)
		.sort((a, b) => compareNames(a.metaData.title ?? '', b.metaData.title ?? ''));
}

/**
 * Pins or unpins the page at path by saving its `pinned` property. The page's
 * text and other properties stay as they are; the change is saved (and
 * committed) like any manual save. Returns the saved page, or undefined when it
 * was already in that state (nothing is saved then).
 */
export async function setPinned(path: string, pinned: boolean): Promise<Document | undefined> {
	const page = await apiClient.getDocumentByPath(path);
	if (isPinned(page) === pinned) return undefined;

	// An object replaces the stored properties: send all of them, with
	// `pinned` set or removed ({} clears the last one).
	const properties: Record<string, unknown> = { ...(page.metaData.properties ?? {}) };
	if (pinned) properties.pinned = true;
	else delete properties.pinned;

	return apiClient.updateDocumentByPath(
		path,
		{ metaData: { ...page.metaData, properties }, content: page.content },
		'manual'
	);
}
