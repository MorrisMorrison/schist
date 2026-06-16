/**
 * Generate document colors based on semantic content categories
 * Uses your existing color system with simple keyword matching
 */

// Semantic color mapping using your existing design system colors
const SEMANTIC_COLORS = {
	// Development & Technical (Blue - Ocean Blue)
	api: 'from-blue-500/90 to-blue-600/90',
	documentation: 'from-blue-500/90 to-blue-600/90',
	readme: 'from-blue-500/90 to-blue-600/90',
	tech: 'from-blue-500/90 to-blue-600/90',
	dev: 'from-blue-500/90 to-blue-600/90',
	development: 'from-blue-500/90 to-blue-600/90',
	project: 'from-blue-500/90 to-blue-600/90',
	game: 'from-blue-500/90 to-blue-600/90',
	code: 'from-blue-500/90 to-blue-600/90',

	// Configuration & Settings (Orange - Warning)
	config: 'from-orange-500/90 to-orange-600/90',
	configuration: 'from-orange-500/90 to-orange-600/90',
	setting: 'from-orange-500/90 to-orange-600/90',
	settings: 'from-orange-500/90 to-orange-600/90',
	env: 'from-orange-500/90 to-orange-600/90',
	environment: 'from-orange-500/90 to-orange-600/90',

	// Design & UI (Pink)
	design: 'from-pink-500/90 to-pink-600/90',
	ui: 'from-pink-500/90 to-pink-600/90',
	ux: 'from-pink-500/90 to-pink-600/90',
	style: 'from-pink-500/90 to-pink-600/90',

	// Guides & Tutorials (Green)
	guide: 'from-green-500/90 to-green-600/90',
	tutorial: 'from-green-500/90 to-green-600/90',
	help: 'from-green-500/90 to-green-600/90',
	howto: 'from-green-500/90 to-green-600/90',

	// Planning & Notes (Teal)
	note: 'from-teal-500/90 to-teal-600/90',
	notes: 'from-teal-500/90 to-teal-600/90',
	plan: 'from-teal-500/90 to-teal-600/90',
	planning: 'from-teal-500/90 to-teal-600/90',
	idea: 'from-teal-500/90 to-teal-600/90',
	ideas: 'from-teal-500/90 to-teal-600/90',

	// Security & Important (Red)
	security: 'from-red-500/90 to-red-600/90',
	important: 'from-red-500/90 to-red-600/90',
	urgent: 'from-red-500/90 to-red-600/90',
	critical: 'from-red-500/90 to-red-600/90'
} as const;

// Default fallback color (Gray)
const DEFAULT_COLOR = 'from-slate-500/90 to-slate-600/90';

/**
 * Get document color based on title using semantic keyword matching
 *
 * @param title - Document title
 * @returns Tailwind gradient class string
 */
export function getDocumentColor(title: string): string {
	const normalizedTitle = title.toLowerCase();

	// Check for semantic keywords
	for (const [keyword, color] of Object.entries(SEMANTIC_COLORS)) {
		if (normalizedTitle.includes(keyword)) {
			return color;
		}
	}

	// Fallback to default gray
	return DEFAULT_COLOR;
}
