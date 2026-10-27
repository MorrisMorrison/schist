import type { Asset } from '#lib/api/types.ts';

export type EditorTheme = 'light' | 'dark';

/** Reading the rendered document, or editing its markdown in place. */
export type DocumentMode = 'read' | 'edit';

export interface ProseEditorProps {
	/** Initial text; the editor owns it afterwards (see `setContent`). */
	content?: string;
	onContentChange?: (content: string) => void;
	/** Focus the editor once it has loaded. */
	autofocus?: boolean;
	/** Initial selection (e.g. the placeholder title on a new document). */
	initialSelection?: { anchor: number; head: number };
	/** Ctrl/Cmd+S inside the editor. */
	onSave?: () => void;
	onUploadStart?: () => void;
	onUploadProgress?: (progress: number) => void;
	onUploadComplete?: (asset: Asset) => void;
	onUploadError?: (error: string) => void;
}

export interface UploadStatusProps {
	isUploading?: boolean;
	uploadProgress?: number;
	uploadMessage?: string | null;
	uploadError?: string | null;
}

export interface PreviewProps {
	content: string;
	className?: string;
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
