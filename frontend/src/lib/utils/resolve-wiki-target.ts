import { generateSlug } from '#lib/utils/path.ts';

/** What a link target is matched against: a page's path, title and properties. */
export interface LinkablePage {
	metaData?: { path?: string; title?: string; properties?: Record<string, unknown> };
}

export interface ResolvedWikiTarget {
	/** Where the link goes (the root slug when nothing matched). */
	path: string;
	exists: boolean;
}

/** An alias or page name more than one page has: links by it stay unresolved. */
const AMBIGUOUS = '';

function aliasesOf(page: LinkablePage): string[] {
	const value = page.metaData?.properties?.aliases;
	const list = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
	return list.filter((item): item is string => typeof item === 'string').map((a) => a.trim());
}

function addUnique(names: Map<string, string>, name: string, path: string) {
	if (!name) return;
	const existing = names.get(name);
	names.set(name, existing !== undefined && existing !== path ? AMBIGUOUS : path);
}

/**
 * Resolves a [[target]] the way the server's link index does: by title, then
 * the page at the root slug, then a page's alias, then a page's name (the last
 * segment of its path, which is an imported note's file name). Aliases and
 * names shared by several pages don't resolve.
 */
export function resolveWikiTarget(
	target: string,
	documents: readonly LinkablePage[]
): ResolvedWikiTarget {
	const wanted = target.trim().toLowerCase();
	const slug = generateSlug(target);
	const rootPath = `/${slug}`;

	const byTitle = documents.find((page) => page.metaData?.title?.toLowerCase() === wanted);
	if (byTitle?.metaData?.path) return { path: byTitle.metaData.path, exists: true };

	if (documents.some((page) => page.metaData?.path === rootPath)) {
		return { path: rootPath, exists: true };
	}

	const byAlias = new Map<string, string>();
	const byName = new Map<string, string>();
	for (const page of documents) {
		const path = page.metaData?.path;
		if (!path) continue;
		for (const alias of aliasesOf(page)) addUnique(byAlias, alias.toLowerCase(), path);
		addUnique(byName, path.split('/').pop() ?? '', path);
	}

	const match = byAlias.get(wanted) || byName.get(slug);
	return match ? { path: match, exists: true } : { path: rootPath, exists: false };
}
