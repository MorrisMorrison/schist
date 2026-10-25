/**
 * Format a date string into a human-readable relative format
 * @param dateString - ISO date string to format
 * @returns Human-readable date string
 */
export function formatRelativeDate(dateString?: string): string {
	if (!dateString) return '';

	const date = new Date(dateString);
	const now = new Date();
	const diffTime = Math.abs(now.getTime() - date.getTime());
	const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

	// Handle same day
	if (diffDays === 0) return 'Today';
	if (diffDays === 1) return 'Yesterday';

	// Handle recent days
	if (diffDays < 7) return `${diffDays} days ago`;

	// Handle weeks
	if (diffDays < 30) {
		const weeks = Math.floor(diffDays / 7);
		return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
	}

	// Handle months
	if (diffDays < 365) {
		const months = Math.floor(diffDays / 30);
		return `${months} month${months === 1 ? '' : 's'} ago`;
	}

	// For older dates, show the actual date
	return date.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});
}

/**
 * Format a date string into a standard format
 * @param dateString - ISO date string to format
 * @returns Formatted date string
 */
export function formatDate(dateString?: string): string {
	if (!dateString) return '';
	return new Date(dateString).toLocaleDateString();
}
