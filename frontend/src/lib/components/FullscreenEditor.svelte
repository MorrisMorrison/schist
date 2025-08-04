<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { EditorView, basicSetup } from 'codemirror';
	import { EditorState, StateEffect } from '@codemirror/state';
	import { markdown } from '@codemirror/lang-markdown';

	import EditorToolbar from './EditorToolbar.svelte';
	import MarkdownPreview from './MarkdownPreview.svelte';
	import type { FormattingType, AutoSaveConfig } from '$lib/types/editor';
	import { theme } from '$lib/stores/theme.js';
	import { imagePasteExtension } from '$lib/utils/image-paste.js';
	import { wikiLinksExtension } from '$lib/utils/wiki-links.js';
	import type { Asset } from '$lib/api/types.js';

	interface FullscreenEditorProps {
		open: boolean;
		onClose: () => void;
		initialContent?: string;
		autoSave?: Partial<AutoSaveConfig>;
		onContentChange?: (content: string) => void;
		onSave?: (content: string) => Promise<void> | void;
		readonly?: boolean;
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

	let editorElement = $state<HTMLElement>();
	let editorView: EditorView | null = null;
	let currentContent = $state(initialContent);
	let isDirty = $state(false);
	let lastSaved = $state<Date | null>(null);
	let isPreviewVisible = $state(true);

	let isUploading = $state(false);
	let uploadProgress = $state(0);
	let uploadMessage = $state<string | null>(null);
	let uploadError = $state<string | null>(null);

	const currentTheme = $derived($theme);

	const lightTheme = EditorView.theme({
		'&': {
			backgroundColor: '#f8fafc', // --gray-50
			color: '#0f172a' // --gray-900
		},
		'.cm-content': {
			backgroundColor: '#f8fafc',
			color: '#0f172a'
		},
		'.cm-focused': {
			backgroundColor: '#f8fafc'
		},
		'.cm-editor': {
			backgroundColor: '#f8fafc'
		},
		'.cm-scroller': {
			backgroundColor: '#f8fafc'
		},
		'.cm-gutters': {
			backgroundColor: '#f1f5f9', // --gray-100
			color: '#64748b', // --gray-500
			border: 'none'
		},
		'.cm-activeLine': {
			backgroundColor: '#f1f5f9' // --gray-100
		},
		'.cm-selectionBackground': {
			backgroundColor: '#e2e8f0' // --gray-200
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
			backgroundColor: '#0f172a', // --gray-900
			color: '#f8fafc' // --gray-50
		},
		'.cm-content': {
			backgroundColor: '#0f172a',
			color: '#f8fafc'
		},
		'.cm-focused': {
			backgroundColor: '#0f172a'
		},
		'.cm-editor': {
			backgroundColor: '#0f172a'
		},
		'.cm-scroller': {
			backgroundColor: '#0f172a'
		},
		'.cm-gutters': {
			backgroundColor: '#1e293b', // --gray-800
			color: '#94a3b8', // --gray-400
			border: 'none'
		},
		'.cm-activeLine': {
			backgroundColor: '#1e293b' // --gray-800
		},
		'.cm-selectionBackground': {
			backgroundColor: '#334155' // --gray-700
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

	function updateContent(content: string) {
		if (content === currentContent) return;

		currentContent = content;
		isDirty = true;

		if (onContentChange) {
			onContentChange(content);
		}

		scheduleAutoSave();
	}

	function scheduleAutoSave() {
		if (!autoSaveConfig.enabled || !isDirty) return;

		if (autoSaveTimer) {
			clearTimeout(autoSaveTimer);
		}

		autoSaveTimer = setTimeout(async () => {
			await saveContent();
		}, autoSaveConfig.intervalInMillis);
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
			]
		});

		editorView = new EditorView({
			state,
			parent: editorElement
		});
	}

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

	$effect(() => {
		if (open && editorElement && !editorView) {
			initializeEditor();
		}
	});

	$effect(() => {
		if (editorView && currentTheme && open) {
			const extensions = [
				basicSetup,
				markdown(),
				currentTheme === 'dark' ? darkTheme : lightTheme,
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
