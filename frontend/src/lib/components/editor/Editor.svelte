<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { EditorView, basicSetup } from 'codemirror';
	import { EditorState, StateEffect } from '@codemirror/state';
	import { markdown } from '@codemirror/lang-markdown';
	import { drawSelection } from '@codemirror/view';

	import EditorToolbar from './EditorToolbar.svelte';
	import MarkdownPreview from './MarkdownPreview.svelte';
	import type { EditorProps, FormattingType } from '$lib/types/editor';
	import { theme } from '$lib/stores/theme.js';
	import { imagePasteExtension } from '$lib/utils/image-paste.js';
	import { wikiLinksExtension } from '$lib/utils/wiki-links.js';
	import { hashtagExtension } from '$lib/utils/hashtag-extension.js';
	import { combinedAutocompletionExtension } from '$lib/utils/combined-autocomplete.js';
	import type { Asset } from '$lib/api/types.js';
	import { appSettings } from '$lib/stores/settings.js';

	let {
		initialContent = '',
		autoSave = {},
		onContentChange,
		onSave,
		readonly = false,
		fullscreen = false,
		...rest
	}: Omit<EditorProps, 'theme'> & { fullscreen?: boolean } = $props();

	// Explicitly mark as used to avoid linting errors
	void rest;

	let editorElement: HTMLElement;
	let editorView: EditorView | null = null;
	let currentContent = $state(initialContent);
	let previewContent = $state(initialContent);
	let isDirty = $state(false);
	let lastSaved = $state<Date | null>(null);
	let isPreviewVisible = $state(!$appSettings.alwaysHidePreview);
	let isFullscreen = $state(fullscreen || $appSettings.alwaysOpenFullscreen);

	let editorHeight = $state(700);
	let isResizing = $state(false);
	let resizeStartY = $state(0);
	let resizeStartHeight = $state(0);

	let previewContainer = $state<HTMLElement | null>(null);
	let isEditorScrolling = $state(false);
	let isPreviewScrolling = $state(false);
	let scrollSyncTimeout: ReturnType<typeof setTimeout> | null = null;

	const currentTheme = $derived($theme);

	const editorLayoutTheme = EditorView.theme({
		'&': {
			height: '100%',
			fontSize: '16px',
			fontFamily:
				'-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", sans-serif',
			lineHeight: '1.625'
		},
		'.cm-content': {
			padding: '16px',
			minHeight: '100%'
		},
		'.cm-focused': {
			outline: 'none'
		},
		'.cm-editor': {
			height: '100%'
		},
		'.cm-scroller': {
			height: '100%'
		}
	});

	const lightTheme = EditorView.theme({
		'&': {
			backgroundColor: 'var(--background)',
			color: 'var(--foreground)'
		},
		'.cm-content': {
			backgroundColor: 'var(--background)',
			color: 'var(--foreground)'
		},
		'.cm-focused': {
			backgroundColor: 'var(--background)'
		},
		'.cm-editor': {
			backgroundColor: 'var(--background)'
		},
		'.cm-scroller': {
			backgroundColor: 'var(--background)'
		},
		'.cm-gutters': {
			backgroundColor: 'var(--muted)',
			color: 'var(--muted-foreground)',
			border: 'none'
		},
		'.cm-activeLine': {
			backgroundColor: 'var(--muted)'
		},
		'.cm-selectionBackground, ::selection': {
			backgroundColor: '#60a5fa !important', // --blue-400 - brighter blue for light theme
			color: '#ffffff !important' // white text for better contrast
		},
		'&.cm-focused .cm-selectionBackground': {
			backgroundColor: '#3b82f6 !important', // slightly darker when focused
			color: '#ffffff !important'
		},
		'.cm-selectionMatch': {
			backgroundColor: '#dbeafe' // --blue-100 - lighter for search matches
		},
		'.cm-cursor': {
			borderLeftColor: '#0f172a' // --gray-900 - visible cursor
		},
		'.cm-focused .cm-cursor': {
			borderLeftColor: '#0e7fe9' // --ocean-blue - focused cursor
		}
	});

	const darkTheme = EditorView.theme({
		'&': {
			backgroundColor: 'var(--background)',
			color: 'var(--foreground)'
		},
		'.cm-content': {
			backgroundColor: 'var(--background)',
			color: 'var(--foreground)'
		},
		'.cm-focused': {
			backgroundColor: 'var(--background)'
		},
		'.cm-editor': {
			backgroundColor: 'var(--background)'
		},
		'.cm-scroller': {
			backgroundColor: 'var(--background)'
		},
		'.cm-gutters': {
			backgroundColor: 'var(--muted)',
			color: 'var(--muted-foreground)',
			border: 'none'
		},
		'.cm-activeLine': {
			backgroundColor: 'var(--muted)'
		},
		'.cm-selectionBackground, ::selection': {
			backgroundColor: '#3b82f6 !important', // --blue-500 - good contrast for dark theme
			color: '#ffffff !important' // white text for better contrast
		},
		'&.cm-focused .cm-selectionBackground': {
			backgroundColor: '#60a5fa !important', // lighter blue when focused
			color: '#000000 !important'
		},
		'.cm-selectionMatch': {
			backgroundColor: '#1e40af' // --blue-800 - darker for search matches in dark theme
		},
		'.cm-cursor': {
			borderLeftColor: '#f8fafc' // --gray-50 - visible cursor
		},
		'.cm-focused .cm-cursor': {
			borderLeftColor: '#0e7fe9' // --ocean-blue - focused cursor
		}
	});

	const autoSaveConfig = {
		enabled: true,
		interval: 30000, // 30 seconds
		onSave: onSave,
		...autoSave
	};

	let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
	let previewUpdateTimer: ReturnType<typeof setTimeout> | null = null;

	let isUploading = $state(false);
	let uploadProgress = $state(0);
	let uploadMessage = $state<string | null>(null);
	let uploadError = $state<string | null>(null);

	function updateContent(content: string, immediate: boolean = false) {
		if (content === currentContent) return;

		currentContent = content;
		isDirty = true;

		if (onContentChange) {
			onContentChange(content);
		}

		scheduleAutoSave();
		schedulePreviewUpdate(content, immediate);
	}

	function schedulePreviewUpdate(content: string, immediate: boolean = false) {
		if (previewUpdateTimer) {
			clearTimeout(previewUpdateTimer);
		}

		if (immediate) {
			previewContent = content;
			return;
		}

		previewUpdateTimer = setTimeout(() => {
			previewContent = content;
		}, 300);
	}

	function throttleScrollSync(callback: () => void) {
		if (scrollSyncTimeout) {
			clearTimeout(scrollSyncTimeout);
		}
		scrollSyncTimeout = setTimeout(callback, 16);
	}

	function syncEditorToPreview() {
		if (!editorView || !previewContainer || isPreviewScrolling) return;

		const scrollTop = editorView.scrollDOM.scrollTop;
		const scrollHeight = editorView.scrollDOM.scrollHeight;
		const clientHeight = editorView.scrollDOM.clientHeight;

		if (scrollHeight <= clientHeight) return;

		const scrollPercentage = scrollTop / (scrollHeight - clientHeight);
		const targetScrollHeight = previewContainer.scrollHeight - previewContainer.clientHeight;

		if (targetScrollHeight > 0) {
			isEditorScrolling = true;
			previewContainer.scrollTop = scrollPercentage * targetScrollHeight;
			setTimeout(() => {
				isEditorScrolling = false;
			}, 50);
		}
	}

	function syncPreviewToEditor() {
		if (!editorView || !previewContainer || isEditorScrolling) return;

		const scrollTop = previewContainer.scrollTop;
		const scrollHeight = previewContainer.scrollHeight;
		const clientHeight = previewContainer.clientHeight;

		if (scrollHeight <= clientHeight) return;

		const scrollPercentage = scrollTop / (scrollHeight - clientHeight);
		const targetScrollHeight =
			editorView.scrollDOM.scrollHeight - editorView.scrollDOM.clientHeight;

		if (targetScrollHeight > 0) {
			isPreviewScrolling = true;
			editorView.scrollDOM.scrollTop = scrollPercentage * targetScrollHeight;
			setTimeout(() => {
				isPreviewScrolling = false;
			}, 50);
		}
	}

	function createScrollSyncExtension() {
		return EditorView.domEventHandlers({
			scroll() {
				if (previewContainer && !isPreviewScrolling) {
					throttleScrollSync(syncEditorToPreview);
				}
			}
		});
	}

	function scheduleAutoSave() {
		if (!autoSaveConfig.enabled || !isDirty) return;

		if (autoSaveTimer) {
			clearTimeout(autoSaveTimer);
		}

		autoSaveTimer = setTimeout(async () => {
			await saveContent();
		}, autoSaveConfig.interval);
	}

	async function saveContent() {
		if (!isDirty || !autoSaveConfig.onSave) return;

		try {
			await autoSaveConfig.onSave(currentContent);
			isDirty = false;
			lastSaved = new Date();
		} catch (error) {
			console.error('Auto-save failed:', error);
		}
	}

	function formatText(type: FormattingType, value?: string) {
		if (!editorView) return;

		const selection = editorView.state.selection.main;
		const selectedText = editorView.state.doc.sliceString(selection.from, selection.to);
		let replacement = '';
		let cursorOffset = 0;

		switch (type) {
			case 'bold':
				replacement = `**${selectedText || 'bold text'}**`;
				cursorOffset = selectedText ? 0 : -2;
				break;
			case 'italic':
				replacement = `*${selectedText || 'italic text'}*`;
				cursorOffset = selectedText ? 0 : -1;
				break;
			case 'heading1':
				replacement = `# ${selectedText || 'Heading 1'}`;
				cursorOffset = selectedText ? 0 : 0;
				break;
			case 'heading2':
				replacement = `## ${selectedText || 'Heading 2'}`;
				cursorOffset = selectedText ? 0 : 0;
				break;
			case 'heading3':
				replacement = `### ${selectedText || 'Heading 3'}`;
				cursorOffset = selectedText ? 0 : 0;
				break;
			case 'bulletList':
				replacement = `- ${selectedText || 'List item'}`;
				break;
			case 'numberedList':
				replacement = `1. ${selectedText || 'List item'}`;
				break;
			case 'link': {
				const url = value || 'https://example.com';
				replacement = `[${selectedText || 'link text'}](${url})`;
				cursorOffset = selectedText ? 0 : -url.length - 1;
				break;
			}
			case 'wikiLink':
				replacement = `[[${selectedText || 'Document Name'}]]`;
				cursorOffset = selectedText ? 0 : -2;
				break;
			case 'code':
				replacement = `\`${selectedText || 'code'}\``;
				cursorOffset = selectedText ? 0 : -1;
				break;
			case 'quote':
				replacement = `> ${selectedText || 'Quote'}`;
				break;
		}

		const transaction = editorView.state.update({
			changes: { from: selection.from, to: selection.to, insert: replacement },
			selection: cursorOffset
				? { anchor: selection.from + replacement.length + cursorOffset }
				: undefined
		});

		editorView.dispatch(transaction);
		editorView.focus();
	}

	function togglePreview() {
		isPreviewVisible = !isPreviewVisible;
	}

	function toggleFullscreen() {
		isFullscreen = !isFullscreen;
	}

	function initializeEditor() {
		if (!editorElement) return;

		if (editorView) {
			editorView.destroy();
		}

		const state = EditorState.create({
			doc: currentContent,
			extensions: [
				basicSetup,
				markdown(),
				currentTheme === 'dark' ? darkTheme : lightTheme,
				drawSelection(),
				wikiLinksExtension(),
				hashtagExtension(),
				combinedAutocompletionExtension(),
				createScrollSyncExtension(),
				EditorView.updateListener.of((update) => {
					if (update.docChanged) {
						const newContent = update.state.doc.toString();
						if (newContent !== currentContent) {
							updateContent(newContent);
						}
					}
				}),
				EditorView.lineWrapping,
				EditorState.readOnly.of(readonly),
				imagePasteExtension({
					onUploadStart: () => {
						isUploading = true;
						uploadProgress = 0;
						uploadMessage = 'Starting upload...';
						uploadError = null;
					},
					onUploadProgress: (progress) => {
						uploadProgress = progress;
						uploadMessage = `Uploading... ${Math.round(progress)}%`;
					},
					onUploadComplete: (asset: Asset) => {
						isUploading = false;
						uploadMessage = `Uploaded ${asset.original_name}`;
						setTimeout(() => {
							uploadMessage = null;
						}, 3000);
					},
					onUploadError: (error: string) => {
						isUploading = false;
						uploadError = error;
						uploadMessage = null;
						setTimeout(() => {
							uploadError = null;
						}, 5000);
					}
				}),
				editorLayoutTheme
			]
		});

		editorView = new EditorView({
			state,
			parent: editorElement
		});
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'F11' || (isFullscreen && event.key === 'Escape')) {
			event.preventDefault();
			toggleFullscreen();
			return;
		}

		if (!event.ctrlKey && !event.metaKey) return;

		switch (event.key) {
			case 'b':
				event.preventDefault();
				formatText('bold');
				break;
			case 'i':
				event.preventDefault();
				formatText('italic');
				break;
			case '1':
				event.preventDefault();
				formatText('heading1');
				break;
			case '2':
				event.preventDefault();
				formatText('heading2');
				break;
			case '3':
				event.preventDefault();
				formatText('heading3');
				break;
			case 'k':
				event.preventDefault();
				if (event.shiftKey) {
					formatText('wikiLink');
				} else {
					formatText('link');
				}
				break;
			case '`':
				event.preventDefault();
				formatText('code');
				break;
			case 's':
				event.preventDefault();
				saveContent();
				break;
		}
	}

	function handleResizeStart(event: MouseEvent) {
		event.preventDefault();
		isResizing = true;
		resizeStartY = event.clientY;
		resizeStartHeight = editorHeight;

		document.addEventListener('mousemove', handleResizeMove);
		document.addEventListener('mouseup', handleResizeEnd);
		document.body.style.cursor = 'ns-resize';
		document.body.style.userSelect = 'none';
	}

	function handleResizeMove(event: MouseEvent) {
		if (!isResizing) return;

		const deltaY = event.clientY - resizeStartY;
		const newHeight = Math.max(200, resizeStartHeight + deltaY);
		editorHeight = newHeight;
	}

	function handleResizeEnd() {
		isResizing = false;
		document.removeEventListener('mousemove', handleResizeMove);
		document.removeEventListener('mouseup', handleResizeEnd);
		document.body.style.cursor = '';
		document.body.style.userSelect = '';
	}

	onMount(() => {
		initializeEditor();
	});

	onDestroy(() => {
		if (editorView) {
			editorView.destroy();
		}
		if (autoSaveTimer) {
			clearTimeout(autoSaveTimer);
		}
		if (scrollSyncTimeout) {
			clearTimeout(scrollSyncTimeout);
		}
		if (previewUpdateTimer) {
			clearTimeout(previewUpdateTimer);
		}
	});

	// Reactive theme updates - only update theme, don't recreate editor
	$effect(() => {
		if (editorView && currentTheme) {
			const extensions = [
				basicSetup,
				markdown(),
				currentTheme === 'dark' ? darkTheme : lightTheme,
				drawSelection(),
				wikiLinksExtension(),
				hashtagExtension(),
				combinedAutocompletionExtension(),
				createScrollSyncExtension(),
				EditorView.updateListener.of((update) => {
					if (update.docChanged) {
						const newContent = update.state.doc.toString();
						if (newContent !== currentContent) {
							updateContent(newContent);
						}
					}
				}),
				EditorView.lineWrapping,
				EditorState.readOnly.of(readonly),
				imagePasteExtension({
					onUploadStart: () => {
						isUploading = true;
						uploadProgress = 0;
						uploadMessage = 'Starting upload...';
						uploadError = null;
					},
					onUploadProgress: (progress) => {
						uploadProgress = progress;
						uploadMessage = `Uploading... ${Math.round(progress)}%`;
					},
					onUploadComplete: (asset: Asset) => {
						isUploading = false;
						uploadMessage = `Uploaded ${asset.original_name}`;
						setTimeout(() => {
							uploadMessage = null;
						}, 3000);
					},
					onUploadError: (error: string) => {
						isUploading = false;
						uploadError = error;
						uploadMessage = null;
						setTimeout(() => {
							uploadError = null;
						}, 5000);
					}
				}),
				editorLayoutTheme
			];

			editorView.dispatch({
				effects: StateEffect.reconfigure.of(extensions)
			});
		}
	});

	$effect(() => {
		if (editorView && initialContent !== currentContent) {
			const newContent = initialContent || '';
			currentContent = newContent;

			editorView.dispatch({
				changes: {
					from: 0,
					to: editorView.state.doc.length,
					insert: newContent
				}
			});
		}
	});

	const themeClasses = $derived(
		'bg-background text-foreground' + (currentTheme === 'dark' ? ' dark' : '')
	);

	// Public method for immediate content updates (e.g., template application)
	export function setContentImmediate(content: string) {
		if (editorView) {
			// Update the editor content immediately
			editorView.dispatch({
				changes: {
					from: 0,
					to: editorView.state.doc.length,
					insert: content
				}
			});
		}
		// Force immediate preview update
		updateContent(content, true);
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div
	class="markdown-editor flex flex-col {themeClasses} {isFullscreen ? 'fixed inset-0 z-50' : ''}"
	style={isFullscreen ? '' : `height: ${editorHeight}px;`}
	role={isFullscreen ? 'dialog' : 'region'}
	aria-modal={isFullscreen}
	aria-label={isFullscreen ? 'Fullscreen Editor' : 'Markdown Editor'}
>
	<!-- Toolbar -->
	<EditorToolbar
		onFormat={formatText}
		theme={currentTheme}
		disabled={readonly}
		onFullscreenToggle={toggleFullscreen}
		{isFullscreen}
	/>

	<!-- Editor and Preview Container -->
	<div class="flex flex-1 overflow-hidden {isFullscreen ? '' : 'border-primary border-r border-l'}">
		<!-- Editor Panel -->
		<div
			class="border-primary flex flex-col {isPreviewVisible ? 'w-1/2 border-r' : 'w-full'} min-w-0"
		>
			<!-- Editor Controls -->
			<div
				class="border-primary bg-background flex min-h-[3rem] items-center justify-between border-b px-4 py-2"
			>
				<div class="flex items-center gap-4">
					<span class="text-sm font-medium">{isFullscreen ? 'Fullscreen Editor' : 'Editor'}</span>
					{#if isDirty}
						<span
							class="bg-muted text-muted-foreground rounded px-2 py-1 text-xs"
							data-testid="unsaved-indicator"
						>
							Unsaved changes
						</span>
					{/if}
					{#if lastSaved}
						<span class="text-muted-foreground text-xs" data-testid="auto-saved">
							Saved {lastSaved.toLocaleTimeString()}
						</span>
					{/if}
				</div>
				<div class="flex items-center gap-2">
					<button
						class="border-secondary text-foreground hover:bg-accent rounded border px-3 py-1 text-sm transition-colors"
						onclick={togglePreview}
					>
						{isPreviewVisible ? 'Hide Preview' : 'Show Preview'}
					</button>
					{#if isFullscreen}
						<span class="text-muted-foreground text-xs">Press F11 or Escape to exit</span>
					{/if}
				</div>
			</div>

			<!-- CodeMirror Editor -->
			<div class="flex-1 overflow-hidden">
				<div bind:this={editorElement} class="h-full" data-testid="document-content-textarea"></div>
			</div>
		</div>

		<!-- Preview Panel -->
		{#if isPreviewVisible}
			<div class="flex w-1/2 min-w-0 flex-col">
				<div
					class="border-primary bg-background flex min-h-[3rem] items-center justify-between border-b px-4 py-2"
				>
					<span class="text-sm font-medium">Preview</span>
				</div>
				<div class="flex-1 overflow-hidden">
					<MarkdownPreview
						content={previewContent}
						theme={currentTheme}
						bind:container={previewContainer}
						onScroll={() => {
							if (previewContainer && !isEditorScrolling) {
								throttleScrollSync(syncPreviewToEditor);
							}
						}}
					/>
				</div>
			</div>
		{/if}
	</div>

	<!-- Image upload status -->
	{#if isUploading || uploadMessage || uploadError}
		<div class="border-primary bg-background border-t px-4 py-2">
			{#if isUploading}
				<div class="flex items-center gap-3">
					<div class="flex-1">
						<div class="bg-muted h-2 overflow-hidden rounded-full">
							<div
								class="h-full bg-blue-500 transition-[width] duration-300"
								style="width: {uploadProgress}%"
							></div>
						</div>
					</div>
					<span class="text-foreground text-sm">
						{uploadMessage}
					</span>
				</div>
			{/if}
			{#if uploadMessage && !isUploading}
				<div class="text-sm text-green-600 dark:text-green-400">
					✓ {uploadMessage}
				</div>
			{/if}
			{#if uploadError}
				<div class="text-sm text-red-600 dark:text-red-400">
					✗ {uploadError}
				</div>
			{/if}
		</div>
	{/if}

	<!-- Status Bar -->
	<div
		class="border-primary bg-background text-muted-foreground flex items-center justify-between border-t px-4 py-2 text-xs"
	>
		<div class="flex items-center gap-4">
			<span>Words: {currentContent.split(/\s+/).filter((w) => w.length > 0).length}</span>
			<span>Characters: {currentContent.length}</span>
			<span>Lines: {currentContent.split('\n').length}</span>
		</div>
		<div class="flex items-center gap-2">
			{#if autoSaveConfig.enabled}
				<span>Auto-save enabled</span>
			{/if}
			<span>Theme: {currentTheme}</span>
			{#if isFullscreen}
				<span>Fullscreen Mode</span>
			{/if}
		</div>
	</div>

	{#if !isFullscreen}
		<!-- Resize Handle -->
		<div
			class="border-primary bg-muted hover:bg-accent flex h-4 cursor-ns-resize items-center justify-center border-t transition-colors"
			onmousedown={handleResizeStart}
			role="button"
			tabindex="0"
			aria-label="Resize editor height"
		>
			<div class="h-1 w-8 rounded-full bg-gray-400"></div>
		</div>
	{/if}
</div>

<style>
	.markdown-editor {
		resize: none; /* Disable default resize */
	}

	/* Ensure CodeMirror fills the container */
	:global(.markdown-editor .cm-editor) {
		height: 100% !important;
	}

	:global(.markdown-editor .cm-scroller) {
		height: 100% !important;
	}

	/* Custom scrollbar for consistency */
	:global(.markdown-editor .cm-scroller::-webkit-scrollbar) {
		width: 6px;
	}

	:global(.markdown-editor .cm-scroller::-webkit-scrollbar-track) {
		background: transparent;
	}

	:global(.markdown-editor .cm-scroller::-webkit-scrollbar-thumb) {
		background-color: rgba(156, 163, 175, 0.5);
		border-radius: 3px;
	}

	:global(.markdown-editor .cm-scroller::-webkit-scrollbar-thumb:hover) {
		background-color: rgba(156, 163, 175, 0.7);
	}

	/* Force text selection visibility */
	:global(.markdown-editor .cm-selectionBackground) {
		background-color: #3b82f6 !important;
		color: white !important;
		opacity: 1 !important;
		display: block !important;
		visibility: visible !important;
	}

	:global(.markdown-editor.cm-focused .cm-selectionBackground) {
		background-color: #60a5fa !important;
		color: white !important;
	}

	:global(.markdown-editor .cm-content) {
		user-select: text !important;
		-webkit-user-select: text !important;
		-moz-user-select: text !important;
	}

	/* Alternative selection styling using CSS pseudo-element */
	:global(.markdown-editor .cm-content ::selection) {
		background-color: #3b82f6 !important;
		color: white !important;
	}

	:global(.markdown-editor .cm-content ::-moz-selection) {
		background-color: #3b82f6 !important;
		color: white !important;
	}
</style>
