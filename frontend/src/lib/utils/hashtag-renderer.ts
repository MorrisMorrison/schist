import { badgeVariants } from '#lib/components/ui/badge/badge.svelte';
import { HASHTAG_REGEX } from './hashtag-constants';

/**
 * Turns #tags in markdown prose into badge HTML. Fenced code blocks and inline
 * code are left exactly as they are: a colour like `fill:#fff` or a shell
 * comment is code, not a tag, and HTML injected there shows up as text.
 */
export function processHashtags(text: string): string {
	const badgeClasses = badgeVariants({ variant: 'tag' });
	const badge = `<span class="${badgeClasses}" title="Tag: $1">#$1</span>`;

	return mapProse(text, (prose) => prose.replace(HASHTAG_REGEX, badge));
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const INLINE_CODE = /(`+)[\s\S]*?\1/g;

/**
 * Applies fn to the parts of markdown that are neither fenced nor inline code,
 * and code to the code parts (a whole fenced block, or one inline span); code
 * defaults to leaving them as they are.
 */
export function mapProse(
	markdown: string,
	fn: (prose: string) => string,
	code: (code: string) => string = (c) => c
): string {
	const out: string[] = [];
	let prose: string[] = [];
	let block: string[] = [];
	let fence: string | null = null;

	const flushProse = () => {
		if (prose.length > 0) {
			out.push(mapOutsideInlineCode(prose.join('\n'), fn, code));
			prose = [];
		}
	};

	for (const line of markdown.split('\n')) {
		const marker = FENCE.exec(line)?.[1];
		if (fence === null) {
			if (marker) {
				flushProse();
				fence = marker;
				block = [line];
			} else {
				prose.push(line);
			}
			continue;
		}
		block.push(line);
		// A fence closes with the same character, at least as long, and nothing after it.
		if (
			marker &&
			marker[0] === fence[0] &&
			marker.length >= fence.length &&
			line.trim() === marker
		) {
			out.push(code(block.join('\n')));
			fence = null;
		}
	}
	if (fence !== null) out.push(code(block.join('\n'))); // unclosed: code to the end
	flushProse();
	return out.join('\n');
}

function mapOutsideInlineCode(
	text: string,
	fn: (prose: string) => string,
	code: (code: string) => string
): string {
	let result = '';
	let last = 0;
	for (const match of text.matchAll(INLINE_CODE)) {
		result += fn(text.slice(last, match.index)) + code(match[0]);
		last = match.index + match[0].length;
	}
	return result + fn(text.slice(last));
}
