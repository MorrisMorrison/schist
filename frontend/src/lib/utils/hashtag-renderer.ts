/**
 * Utility for rendering hashtags in markdown content using proper Badge component classes
 */
import { badgeVariants } from '$lib/components/ui/badge/badge.svelte';

export function processHashtags(text: string): string {
	// Process hashtags: #hashtag -> <span class="badge-secondary">#hashtag</span>
	// Using the actual Badge component variant classes
	const hashtagRegex = /#([a-zA-Z0-9_-]+)(?!\w)/g;
	const badgeClasses = badgeVariants({ variant: 'secondary' });

	return text.replace(hashtagRegex, `<span class="${badgeClasses}" title="Tag: $1">#$1</span>`);
}
