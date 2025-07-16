/**
 * Editor theme options
 */
export type EditorTheme = 'light' | 'dark';

/**
 * Toolbar button configuration
 */
export interface ToolbarButton {
	id: string;
	label: string;
	icon: string;
	action: () => void;
	shortcut?: string;
	active?: boolean;
}

/**
 * Editor configuration options
 */
export interface EditorConfig {
	theme: EditorTheme;
	lineNumbers: boolean;
	autosave: boolean;
	autosaveInterval: number;
	shortcuts: boolean;
}

/**
 * Editor state interface
 */
export interface EditorState {
	content: string;
	isDirty: boolean;
	lastSaved: Date | null;
	wordCount: number;
	lineCount: number;
}

/**
 * Auto-save configuration
 */
export interface AutoSaveConfig {
	enabled: boolean;
	interval: number; // in milliseconds
	onSave: (content: string) => Promise<void> | void;
}

/**
 * Editor props interface
 */
export interface EditorProps {
	initialContent?: string;
	theme?: EditorTheme;
	config?: Partial<EditorConfig>;
	autoSave?: Partial<AutoSaveConfig>;
	onContentChange?: (content: string) => void;
	onSave?: (content: string) => Promise<void> | void;
	readonly?: boolean;
	placeholder?: string;
}

/**
 * Preview props interface
 */
export interface PreviewProps {
	content: string;
	theme?: EditorTheme;
	className?: string;
}

/**
 * Toolbar props interface
 */
export interface ToolbarProps {
	onFormat: (type: FormattingType, value?: string) => void;
	theme?: EditorTheme;
	onThemeToggle?: () => void;
	disabled?: boolean;
}

/**
 * Formatting types for toolbar actions
 */
export type FormattingType =
	| 'bold'
	| 'italic'
	| 'heading1'
	| 'heading2'
	| 'heading3'
	| 'bulletList'
	| 'numberedList'
	| 'link'
	| 'code'
	| 'quote';

/**
 * Keyboard shortcut mapping
 */
export interface KeyboardShortcuts {
	[key: string]: FormattingType;
}

/**
 * Editor events
 */
export interface EditorEvents {
	contentChange: (content: string) => void;
	save: (content: string) => void;
	focus: () => void;
	blur: () => void;
	selectionChange: (selection: { from: number; to: number }) => void;
}
