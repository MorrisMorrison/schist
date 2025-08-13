/**
 * Utility for rendering hashtags in markdown content using proper Badge component classes
 */
import { badgeVariants } from '$lib/components/ui/badge/badge.svelte';

export function processHashtags(text: string): string {
	const hashtagRegex = /#([a-zA-Z0-9_-]+)(?!\w)/g;
	const badgeClasses = badgeVariants({ variant: 'secondary' });

	return text.replace(
		hashtagRegex,
		`<span class="${badgeClasses} font-semibold text-xs border border-border/60" style="background-color: var(--secondary); color: var(--primary); border-radius: 6px; padding: 2px 6px;" title="Tag: $1">#$1</span>`
	);
}
