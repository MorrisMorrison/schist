/**
 * Drops the first line of a document's markdown when it is a level-one heading
 * that repeats the document's title. The document view already shows the title
 * in its header, so rendering both shows it twice. Only the rendered view uses
 * this; the stored file is never changed.
 */
export function stripLeadingTitleHeading(markdown: string, title: string): string {
	const wanted = normalise(title);
	if (!wanted) return markdown;

	const match = /^\s*#[ \t]+([^\r\n]*?)[ \t]*(?:\r?\n|$)/.exec(markdown);
	if (!match || normalise(match[1]) !== wanted) return markdown;

	return markdown.slice(match[0].length).replace(/^\s+/, '');
}

function normalise(text: string): string {
	return text.trim().replace(/\s+/g, ' ').toLowerCase();
}
