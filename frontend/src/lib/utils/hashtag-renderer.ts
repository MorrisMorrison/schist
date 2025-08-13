import { badgeVariants } from '$lib/components/ui/badge/badge.svelte';
import { HASHTAG_REGEX } from './hashtag-constants';

export function processHashtags(text: string): string {
	const badgeClasses = badgeVariants({ variant: 'secondary' });

	return text.replace(
		HASHTAG_REGEX,
		`<span class="${badgeClasses} font-semibold text-xs border border-border/60" style="background-color: var(--secondary); color: var(--primary); border-radius: 6px; padding: 2px 6px;" title="Tag: $1">#$1</span>`
	);
}
