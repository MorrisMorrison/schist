<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { EditorView, basicSetup } from 'codemirror';
	import { EditorState, StateEffect } from '@codemirror/state';
	import { markdown } from '@codemirror/lang-markdown';
	import { oneDark } from '@codemirror/theme-one-dark';

	import EditorToolbar from './EditorToolbar.svelte';
	import MarkdownPreview from './MarkdownPreview.svelte';
	import type { EditorProps, FormattingType } from '$lib/types/editor';
	import { theme } from '$lib/stores/theme.js';
	import { imagePasteExtension } from '$lib/utils/image-paste.js';
	import { wikiLinksExtension } from '$lib/utils/wiki-links.js';
	import type { Asset } from '$lib/api/types.js';

	interface FullscreenEditorProps extends Omit<EditorProps, 'theme'> {
		open: boolean;
		onClose: () => void;
	}

	let {
		open = false,
		onClose,
		initialContent = '',
		autoSave = {},
		onContentChange,
		onSave,
		readonly = false
	}: FullscreenEditorProps = $props();

	// Editor state
	let editorElement: HTMLElement;
	let editorView: EditorView | null = null;
	let currentContent = $state(initialContent);
	let isDirty = $state(false);
	let lastSaved = $state<Date | null>(null);
	let isPreviewVisible = $state(true);

	// Image upload state
	let isUploading = $state(false);
	let uploadProgress = $state(0);
	let uploadMessage = $state<string | null>(null);
	let uploadError = $state<string | null>(null);

	// Use the global theme store
	const currentTheme = $derived($theme);

	// Auto-save configuration
	const autoSaveConfig = {
		enabled: true,
		interval: 30000, // 30 seconds
		onSave: onSave,
		...autoSave
	};

	// Auto-save timer
	let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

	// Update content and trigger change event
	function updateContent(content: string) {
		// Avoid unnecessary updates
		if (content === currentContent) return;

		currentContent = content;
		isDirty = true;

		// Call external change handler
		if (onContentChange) {
			onContentChange(content);
		}

		// Schedule auto-save
		scheduleAutoSave();
	}

	// Schedule auto-save
	function scheduleAutoSave() {
		if (!autoSaveConfig.enabled || !isDirty) return;

		if (autoSaveTimer) {
			clearTimeout(autoSaveTimer);
		}

		autoSaveTimer = setTimeout(async () => {
			await saveContent();
		}, autoSaveConfig.intervalInMillis);
	}

	// Save content
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

	// Format text based on type
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

	// Toggle preview visibility
	function togglePreview() {
		isPreviewVisible = !isPreviewVisible;
	}

	// Initialize CodeMirror editor
	function initializeEditor() {
		if (!editorElement) return;

		// Destroy existing editor
		if (editorView) {
			editorView.destroy();
		}

		// Create editor state
		const state = EditorState.create({
			doc: currentContent,
			extensions: [
				basicSetup,
				markdown(),
				currentTheme === 'dark' ? oneDark : [],
				wikiLinksExtension(),
				EditorView.updateListener.of((update) => {
					if (update.docChanged) {
						const newContent = update.state.doc.toString();
						// Only update if content actually changed to avoid loops
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
				EditorView.theme({
					'&': {
						height: '100%',
						fontSize: '14px'
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
				})
			]
		});

		// Create editor view
		editorView = new EditorView({
			state,
			parent: editorElement
		});
	}

	// Keyboard shortcuts
	function handleKeydown(event: KeyboardEvent) {
		// F11 or Escape to exit fullscreen
		if (event.key === 'F11' || event.key === 'Escape') {
			event.preventDefault();
			onClose();
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
					// Shift+Ctrl+K for wiki links
					formatText('wikiLink');
				} else {
					// Ctrl+K for regular links
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

	// Component lifecycle
	onMount(() => {
		if (open) {
			initializeEditor();
		}
	});

	onDestroy(() => {
		if (editorView) {
			editorView.destroy();
		}
		if (autoSaveTimer) {
			clearTimeout(autoSaveTimer);
		}
	});

	// Reactive updates when modal opens/closes
	$effect(() => {
		if (open && editorElement && !editorView) {
			initializeEditor();
		}
	});

	// Reactive theme updates
	$effect(() => {
		if (editorView && currentTheme && open) {
			const extensions = [
				basicSetup,
				markdown(),
				currentTheme === 'dark' ? oneDark : [],
				wikiLinksExtension(),
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
				EditorView.theme({
					'&': {
						height: '100%',
						fontSize: '14px'
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
				})
			];

			editorView.dispatch({
				effects: StateEffect.reconfigure.of(extensions)
			});
		}
	});

	// Update editor content when initialContent prop changes
	$effect(() => {
		if (editorView && initialContent !== currentContent && open) {
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

	// Theme classes
	const themeClasses = $derived(
		currentTheme === 'dark' ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-900'
	);
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<!-- Fullscreen Overlay -->
	<div
		class="fixed inset-0 z-50 flex flex-col {themeClasses}"
		role="dialog"
		aria-modal="true"
		aria-label="Fullscreen Editor"
	>
		<!-- Toolbar -->
		<EditorToolbar
			onFormat={formatText}
			theme={currentTheme}
			disabled={readonly}
			onFullscreenToggle={onClose}
			isFullscreen={true}
		/>

		<!-- Editor and Preview Container -->
		<div class="flex flex-1 overflow-hidden">
			<!-- Editor Panel -->
			<div
				class="flex flex-1 flex-col {isPreviewVisible ? 'border-r' : ''} {currentTheme === 'dark'
					? 'border-gray-700'
					: 'border-gray-200'}"
			>
				<!-- Editor Controls -->
				<div
					class="flex items-center justify-between border-b px-4 py-2 {currentTheme === 'dark'
						? 'border-gray-700 bg-gray-800'
						: 'border-gray-200 bg-gray-50'}"
				>
					<div class="flex items-center gap-4">
						<span class="text-sm font-medium">Fullscreen Editor</span>
						{#if isDirty}
							<span
								class="rounded bg-orange-100 px-2 py-1 text-xs text-orange-800 dark:bg-orange-900 dark:text-orange-200"
								data-testid="unsaved-indicator"
							>
								Unsaved changes
							</span>
						{/if}
						{#if lastSaved}
							<span
								class="text-xs {currentTheme === 'dark' ? 'text-gray-400' : 'text-gray-500'}"
								data-testid="auto-saved"
							>
								Saved {lastSaved.toLocaleTimeString()}
							</span>
						{/if}
					</div>
					<div class="flex items-center gap-2">
						<button
							class="rounded border px-3 py-1 text-sm transition-colors
								{currentTheme === 'dark'
								? 'border-gray-600 text-gray-300 hover:bg-gray-700'
								: 'border-gray-300 text-gray-700 hover:bg-gray-100'}"
							onclick={togglePreview}
						>
							{isPreviewVisible ? 'Hide Preview' : 'Show Preview'}
						</button>
						<span class="text-xs text-gray-500">Press F11 or Escape to exit</span>
					</div>
				</div>

				<!-- CodeMirror Editor -->
				<div class="flex-1 overflow-hidden">
					<div bind:this={editorElement} class="h-full"></div>
				</div>
			</div>

			<!-- Preview Panel -->
			{#if isPreviewVisible}
				<div class="flex flex-1 flex-col">
					<div
						class="border-b px-4 py-2 {currentTheme === 'dark'
							? 'border-gray-700 bg-gray-800'
							: 'border-gray-200 bg-gray-50'}"
					>
						<span class="text-sm font-medium">Preview</span>
					</div>
					<div class="flex-1 overflow-hidden">
						<MarkdownPreview content={currentContent} theme={currentTheme} />
					</div>
				</div>
			{/if}
		</div>

		<!-- Image upload status -->
		{#if isUploading || uploadMessage || uploadError}
			<div
				class="border-t px-4 py-2 {currentTheme === 'dark'
					? 'border-gray-700 bg-gray-800'
					: 'border-gray-200 bg-gray-50'}"
			>
				{#if isUploading}
					<div class="flex items-center gap-3">
						<div class="flex-1">
							<div
								class="h-2 overflow-hidden rounded-full {currentTheme === 'dark'
									? 'bg-gray-700'
									: 'bg-gray-200'}"
							>
								<div
									class="h-full bg-blue-500 transition-all duration-300"
									style="width: {uploadProgress}%"
								></div>
							</div>
						</div>
						<span class="text-sm {currentTheme === 'dark' ? 'text-gray-300' : 'text-gray-600'}">
							{uploadMessage}
						</span>
					</div>
				{/if}
				{#if uploadMessage && !isUploading}
					<div class="text-sm {currentTheme === 'dark' ? 'text-green-400' : 'text-green-600'}">
						✓ {uploadMessage}
					</div>
				{/if}
				{#if uploadError}
					<div class="text-sm {currentTheme === 'dark' ? 'text-red-400' : 'text-red-600'}">
						✗ {uploadError}
					</div>
				{/if}
			</div>
		{/if}

		<!-- Status Bar -->
		<div
			class="flex items-center justify-between border-t px-4 py-2 text-xs
			{currentTheme === 'dark'
				? 'border-gray-700 bg-gray-800 text-gray-400'
				: 'border-gray-200 bg-gray-50 text-gray-500'}"
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
				<span>Fullscreen Mode</span>
			</div>
		</div>
	</div>
{/if}

<style>
	/* Ensure CodeMirror fills the container */
	:global(.fullscreen-editor .cm-editor) {
		height: 100% !important;
	}

	:global(.fullscreen-editor .cm-scroller) {
		height: 100% !important;
	}

	/* Custom scrollbar for consistency */
	:global(.fullscreen-editor .cm-scroller::-webkit-scrollbar) {
		width: 6px;
	}

	:global(.fullscreen-editor .cm-scroller::-webkit-scrollbar-track) {
		background: transparent;
	}

	:global(.fullscreen-editor .cm-scroller::-webkit-scrollbar-thumb) {
		background-color: rgba(156, 163, 175, 0.5);
		border-radius: 3px;
	}

	:global(.fullscreen-editor .cm-scroller::-webkit-scrollbar-thumb:hover) {
		background-color: rgba(156, 163, 175, 0.7);
	}
</style>
