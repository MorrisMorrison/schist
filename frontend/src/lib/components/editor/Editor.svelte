<script lang="ts">
	import { onDestroy } from 'svelte';

	import EditorToolbar from './EditorToolbar.svelte';
	import EditorContent from './EditorContent.svelte';
	import EditorControls from './EditorControls.svelte';
	import PreviewPanel from './PreviewPanel.svelte';
	import EditorStatusBar from './EditorStatusBar.svelte';
	import UploadStatus from './UploadStatus.svelte';
	import ResizeHandle from './ResizeHandle.svelte';
	import type { EditorProps, FormattingType } from '$lib/types/editor';
	import { theme } from '$lib/stores/theme.js';
	import type { Asset } from '$lib/api/types.js';
	import { settings } from '$lib/stores/settings.js';

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

	let editorContentRef: EditorContent;
	let currentContent = $state(initialContent);
	let previewContent = $state(initialContent);
	let isDirty = $state(false);
	let lastSaved = $state<Date | null>(null);
	let isPreviewVisible = $state(!settings.app.alwaysHidePreview);
	let isFullscreen = $state(fullscreen || settings.app.alwaysOpenFullscreen);

	let editorHeight = $state(700);
	let isResizing = $state(false);
	let resizeStartY = $state(0);
	let resizeStartHeight = $state(0);

	let previewContainer = $state<HTMLElement | null>(null);
	let isEditorScrolling = $state(false);
	let isPreviewScrolling = $state(false);
	let scrollSyncTimeout: ReturnType<typeof setTimeout> | null = null;

	const currentTheme = $derived(theme.current);

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
		const editorView = editorContentRef?.getEditorView();
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
		const editorView = editorContentRef?.getEditorView();
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
		if (editorContentRef) {
			editorContentRef.formatText(type, value);
		}
	}

	function togglePreview() {
		isPreviewVisible = !isPreviewVisible;
	}

	function toggleFullscreen() {
		isFullscreen = !isFullscreen;
	}

	// Upload handlers for the EditorContent component
	function handleUploadStart() {
		isUploading = true;
		uploadProgress = 0;
		uploadMessage = 'Starting upload...';
		uploadError = null;
	}

	function handleUploadProgress(progress: number) {
		uploadProgress = progress;
		uploadMessage = `Uploading... ${Math.round(progress)}%`;
	}

	function handleUploadComplete(asset: Asset) {
		isUploading = false;
		uploadMessage = `Uploaded ${asset.original_name}`;
		setTimeout(() => {
			uploadMessage = null;
		}, 3000);
	}

	function handleUploadError(error: string) {
		isUploading = false;
		uploadError = error;
		uploadMessage = null;
		setTimeout(() => {
			uploadError = null;
		}, 5000);
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

	onDestroy(() => {
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

	const themeClasses = $derived(
		'bg-background text-foreground' + (currentTheme === 'dark' ? ' dark' : '')
	);

	// Public method for immediate content updates (e.g., template application)
	export function setContentImmediate(content: string) {
		if (editorContentRef) {
			editorContentRef.setContentImmediate(content);
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
			<EditorControls
				{isFullscreen}
				{isDirty}
				{lastSaved}
				{isPreviewVisible}
				onTogglePreview={togglePreview}
			/>

			<!-- CodeMirror Editor -->
			<div class="flex-1 overflow-hidden">
				<EditorContent
					bind:this={editorContentRef}
					content={currentContent}
					theme={currentTheme}
					{readonly}
					onContentChange={updateContent}
					onScrollSync={() => {
						if (previewContainer && !isPreviewScrolling) {
							throttleScrollSync(syncEditorToPreview);
						}
					}}
					onUploadStart={handleUploadStart}
					onUploadProgress={handleUploadProgress}
					onUploadComplete={handleUploadComplete}
					onUploadError={handleUploadError}
				/>
			</div>
		</div>

		<!-- Preview Panel -->
		{#if isPreviewVisible}
			<PreviewPanel
				content={previewContent}
				theme={currentTheme}
				bind:container={previewContainer}
				onScroll={() => {
					if (previewContainer && !isEditorScrolling) {
						throttleScrollSync(syncPreviewToEditor);
					}
				}}
			/>
		{/if}
	</div>

	<!-- Image upload status -->
	<UploadStatus {isUploading} {uploadProgress} {uploadMessage} {uploadError} />

	<!-- Status Bar -->
	<EditorStatusBar
		content={currentContent}
		theme={currentTheme}
		autoSaveEnabled={autoSaveConfig.enabled}
		{isFullscreen}
	/>

	{#if !isFullscreen}
		<ResizeHandle onResizeStart={handleResizeStart} />
	{/if}
</div>

<style>
	.markdown-editor {
		resize: none; /* Disable default resize */
	}
</style>
