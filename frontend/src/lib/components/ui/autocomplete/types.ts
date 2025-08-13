/**
 * TypeScript interfaces for the shared autocomplete system
 */

export interface AutocompleteItem {
	id: string;
	label: string;
	detail?: string;
	info?: string;
	data?: unknown;
}

export interface AutocompletePosition {
	x: number;
	y: number;
}

export interface AutocompleteDropdownProps<T = AutocompleteItem> {
	// Core functionality
	items: T[];
	query: string;
	isVisible: boolean;
	selectedIndex: number;

	// Display configuration
	maxItems?: number;
	placeholder?: string;
	emptyMessage?: string;

	// Item rendering
	getItemLabel: (item: T) => string;
	getItemDetail?: (item: T) => string | undefined;
	getItemInfo?: (item: T) => string | undefined;

	// Positioning
	position?: AutocompletePosition;
	variant?: 'default' | 'compact';

	// Events
	onSelect: (item: T) => void;
	onNavigate?: (index: number) => void;
	onClose: () => void;

	// Styling
	class?: string;
}

// Document-specific interfaces
export interface DocumentItem extends AutocompleteItem {
	path: string;
	title: string;
	preview?: string;
	exists: boolean;
}

// Tag-specific interfaces
export interface TagItem extends AutocompleteItem {
	tag: string;
	count?: number;
}

// Keyboard navigation
export interface KeyboardNavigationResult {
	handled: boolean;
	shouldClose?: boolean;
	shouldSelect?: boolean;
	newIndex?: number;
}
