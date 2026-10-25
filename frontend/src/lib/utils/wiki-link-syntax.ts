/**
 * Finds `[[target]]` / `[[target|display]]` wiki links in markdown source,
 * skipping code: fenced code blocks (``` or ~~~) and inline code spans are
 * matched first and left alone, so `[[` written inside backticks is never
 * treated as the start of a link.
 */
const WIKI_LINK_OR_CODE =
	/(?<fenced>(?<![^\n]) {0,3}(?<fence>`{3,}|~{3,})[^\n]*(?:[\s\S]*?\n {0,3}\k<fence>[`~]*[ \t]*(?=\n|$)|[\s\S]*))|(?<code>(?<!`)(?<ticks>`+)(?!`)(?:(?!\n[ \t]*\n)[\s\S])+?(?<!`)\k<ticks>(?!`))|\[\[(?<target>[^\]|]+)(?:\|(?<display>[^\]]+))?\]\]/g;

export interface WikiLinkMatch {
	/** Offset of the opening `[[`. */
	from: number;
	/** Offset just past the closing `]]`. */
	to: number;
	target: string;
	display?: string;
}

export function findWikiLinkMatches(text: string): WikiLinkMatch[] {
	const matches: WikiLinkMatch[] = [];
	for (const match of text.matchAll(WIKI_LINK_OR_CODE)) {
		const groups = match.groups!;
		if (groups.target === undefined) continue; // code: leave untouched
		matches.push({
			from: match.index!,
			to: match.index! + match[0].length,
			target: groups.target,
			display: groups.display
		});
	}
	return matches;
}

/** Replaces each wiki link outside code with the replacer's result. */
export function replaceWikiLinks(
	text: string,
	replacer: (target: string, display: string | undefined) => string
): string {
	return text.replace(WIKI_LINK_OR_CODE, (whole, ...args) => {
		const groups = args.at(-1) as Record<string, string | undefined>;
		if (groups.target === undefined) return whole;
		return replacer(groups.target, groups.display);
	});
}
