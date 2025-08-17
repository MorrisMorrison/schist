export type EditorTheme = 'light' | 'dark';

export interface ToolbarButton {
	id: string;
	label: string;
	icon: string;
	action: () => void;
	shortcut?: string;
	active?: boolean;
}

export interface EditorConfig {
	theme: EditorTheme;
	lineNumbers: boolean;
	autosave: boolean;
	autosaveInterval: number;
	shortcuts: boolean;
}

export interface EditorState {
	content: string;
	isDirty: boolean;
	lastSaved: Date | null;
	wordCount: number;
	lineCount: number;
}

export interface AutoSaveConfig {
	enabled: boolean;
	intervalInMillis: number;
	onSave: (content: string) => Promise<void> | void;
}

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

export interface EditorContentProps {
	content: string;
	theme: EditorTheme;
	readonly?: boolean;
	onContentChange?: (content: string) => void;
	onScrollSync?: () => void;
	onUploadStart?: () => void;
	onUploadProgress?: (progress: number) => void;
	onUploadComplete?: (asset: unknown) => void;
	onUploadError?: (error: string) => void;
}

export interface EditorControlsProps {
	isFullscreen: boolean;
	isDirty: boolean;
	lastSaved: Date | null;
	isPreviewVisible: boolean;
	onTogglePreview: () => void;
}

export interface PreviewPanelProps {
	content: string;
	theme: EditorTheme;
	container?: HTMLElement | null;
	onScroll?: () => void;
}

export interface EditorStatusBarProps {
	content: string;
	theme: EditorTheme;
	autoSaveEnabled: boolean;
	isFullscreen: boolean;
}

export interface UploadStatusProps {
	isUploading: boolean;
	uploadProgress: number;
	uploadMessage: string | null;
	uploadError: string | null;
}

export interface ResizeHandleProps {
	onResizeStart: (event: MouseEvent) => void;
}

export interface PreviewProps {
	content: string;
	theme?: EditorTheme;
	className?: string;
	container?: HTMLElement | null;
	onScroll?: () => void;
}

export interface ToolbarProps {
	onFormat: (type: FormattingType, value?: string) => void;
	theme?: EditorTheme;
	onThemeToggle?: () => void;
	onFullscreenToggle?: () => void;
	disabled?: boolean;
	isFullscreen?: boolean;
}

export type FormattingType =
	| 'bold'
	| 'italic'
	| 'heading1'
	| 'heading2'
	| 'heading3'
	| 'bulletList'
	| 'numberedList'
	| 'link'
	| 'wikiLink'
	| 'code'
	| 'quote';

export interface KeyboardShortcuts {
	[key: string]: FormattingType;
}

export interface EditorEvents {
	contentChange: (content: string) => void;
	save: (content: string) => void;
	focus: () => void;
	blur: () => void;
	selectionChange: (selection: { from: number; to: number }) => void;
}
