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
export { ApiClient, apiClient, createApiClient } from './api/client.js';
export type {
	Page,
	PageMetaData,
	PageRequest,
	ApiResponse,
	ApiError,
	SearchResponse,
	SearchParams,
	HealthResponse,
	LoadingState
} from './api/types.js';

// Store exports
export {
	pages,
	currentPage,
	searchResults,
	searchQuery,
	loadingStates,
	isLoading,
	errors,
	pageActions,
	filteredPages,
	pageSlugs
} from './stores/pages.js';
