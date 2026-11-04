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
 * Among pages that share a title, the one in the folder closest to the linking
 * page (the deepest common folder), if exactly one is closest. Mirrors the
 * server's nearestPath.
 */
export function nearestPath(from: string | undefined, candidates: string[]): string | undefined {
	if (!from) return undefined;
	const folder = (p: string) => p.split('/').filter(Boolean).slice(0, -1);
	const fromDir = folder(from);
	let best: string | undefined;
	let bestDepth = -1;
	let tie = false;
	for (const candidate of candidates) {
		const dir = folder(candidate);
		let depth = 0;
		while (depth < fromDir.length && depth < dir.length && fromDir[depth] === dir[depth]) depth++;
		if (depth > bestDepth) {
			best = candidate;
			bestDepth = depth;
			tie = false;
		} else if (depth === bestDepth) {
			tie = true;
		}
	}
	return tie ? undefined : best;
}

/** A target written as a page path ([[/folder/page]], [[folder/Page.md]]): the page it names. */
function resolvePath(target: string, documents: readonly LinkablePage[]): string | undefined {
	const trimmed = target.trim();
	if (!trimmed.includes('/')) return undefined;
	const bare = trimmed.replace(/\.md$/i, '').replace(/^\/+|\/+$/g, '');
	const candidates = [bare, bare.split('/').map(generateSlug).join('/')].map(
		(candidate) => `/${candidate.toLowerCase()}`
	);
	return documents.find((page) => {
		const path = page.metaData?.path?.toLowerCase();
		return path !== undefined && candidates.includes(path);
	})?.metaData?.path;
}

/**
 * Resolves a [[target]] the way the server's link index does: by title, then
 * by path ([[/folder/page]] or [[folder/page]]), then the page at the root
 * slug, then a page's alias, then a page's name (the last segment of its path,
 * which is an imported note's file name). A title several pages share finds
 * the one nearest the linking page (`from`, its path), else none of them;
 * aliases and names shared by several pages don't resolve (a path still does).
 */
export function resolveWikiTarget(
	target: string,
	documents: readonly LinkablePage[],
	from?: string
): ResolvedWikiTarget {
	const wanted = target.trim().toLowerCase();
	const slug = generateSlug(target);
	const rootPath = `/${slug}`;

	const byTitle = documents.filter(
		(page) => page.metaData?.path && page.metaData?.title?.trim().toLowerCase() === wanted
	);
	if (byTitle.length === 1) return { path: byTitle[0].metaData!.path!, exists: true };
	const nearest = nearestPath(
		from,
		byTitle.map((page) => page.metaData!.path!)
	);
	if (nearest) return { path: nearest, exists: true };

	const byPath = resolvePath(target, documents);
	if (byPath) return { path: byPath, exists: true };
	if (byTitle.length > 1) return { path: rootPath, exists: false };

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
