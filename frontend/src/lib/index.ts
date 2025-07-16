// place files you want to import through the `$lib` alias in this folder.

// Editor component exports
export { default as Editor } from './components/Editor.svelte';
export { default as EditorToolbar } from './components/EditorToolbar.svelte';
export { default as MarkdownPreview } from './components/MarkdownPreview.svelte';
export type {
	EditorTheme,
	ToolbarButton,
	EditorConfig,
	EditorState,
	AutoSaveConfig,
	EditorProps,
	PreviewProps,
	ToolbarProps,
	FormattingType,
	KeyboardShortcuts,
	EditorEvents
} from './types/editor.js';

// API exports
export { SchістApiClient, apiClient } from './api/client.js';
export type {
	Page,
	PageMetaData,
	CreatePageRequest,
	UpdatePageRequest,
	SearchResult,
	ApiResponse,
	ApiError,
	HealthResponse,
	PageListResponse
} from './api/types.js';

// Store exports
export {
	pages,
	currentPage,
	searchResults,
	searchQuery,
	isLoading,
	error,
	pageActions,
	searchActions,
	pagesStore,
	searchStore
} from './stores/pages.js';

// Theme exports
export {
	theme,
	resolvedTheme,
	themeActions
} from './stores/theme.js';
export type { Theme } from './stores/theme.js';
