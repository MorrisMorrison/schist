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
	items: T[];
	query: string;
	isVisible: boolean;
	selectedIndex: number;

	maxItems?: number;
	placeholder?: string;
	emptyMessage?: string;

	getItemLabel: (item: T) => string;
	getItemDetail?: (item: T) => string | undefined;
	getItemInfo?: (item: T) => string | undefined;

	position?: AutocompletePosition;
	variant?: 'default' | 'compact';

	onSelect: (item: T) => void;
	onNavigate?: (index: number) => void;
	onClose: () => void;

	class?: string;
}

export interface DocumentItem extends AutocompleteItem {
	path: string;
	title: string;
	preview?: string;
	exists: boolean;
}

export interface TagItem extends AutocompleteItem {
	tag: string;
	count?: number;
}

export interface KeyboardNavigationResult {
	handled: boolean;
	shouldClose?: boolean;
	shouldSelect?: boolean;
	newIndex?: number;
}
