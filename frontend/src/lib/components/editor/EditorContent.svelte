<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { EditorView, basicSetup } from 'codemirror';
	import { EditorState, StateEffect } from '@codemirror/state';
	import { markdown } from '@codemirror/lang-markdown';
	import { drawSelection } from '@codemirror/view';
	import { imagePasteExtension } from '$lib/utils/image-paste.js';
	import { wikiLinksExtension } from '$lib/utils/wiki-links.js';
	import { hashtagExtension } from '$lib/utils/hashtag-extension.js';
	import { combinedAutocompletionExtension } from '$lib/utils/combined-autocomplete.js';
	import type { Asset } from '$lib/api/types.js';
	import type { FormattingType } from '$lib/types/editor';

	interface EditorContentProps {
		content: string;
		theme: 'light' | 'dark';
		readonly?: boolean;
		onContentChange?: (content: string) => void;
		onScrollSync?: () => void;
		onUploadStart?: () => void;
		onUploadProgress?: (progress: number) => void;
		onUploadComplete?: (asset: Asset) => void;
		onUploadError?: (error: string) => void;
	}

	let {
		content = '',
		theme = 'light',
		readonly = false,
		onContentChange,
		onScrollSync,
		onUploadStart,
		onUploadProgress,
		onUploadComplete,
		onUploadError
	}: EditorContentProps = $props();

	let editorElement: HTMLElement;
	let editorView: EditorView | null = null;

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
			backgroundColor: '#60a5fa !important',
			color: '#ffffff !important'
		},
		'&.cm-focused .cm-selectionBackground': {
			backgroundColor: '#3b82f6 !important',
			color: '#ffffff !important'
		},
		'.cm-selectionMatch': {
			backgroundColor: '#dbeafe'
		},
		'.cm-cursor': {
			borderLeftColor: '#0f172a'
		},
		'.cm-focused .cm-cursor': {
			borderLeftColor: '#0e7fe9'
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
			backgroundColor: '#3b82f6 !important',
			color: '#ffffff !important'
		},
		'&.cm-focused .cm-selectionBackground': {
			backgroundColor: '#60a5fa !important',
			color: '#000000 !important'
		},
		'.cm-selectionMatch': {
			backgroundColor: '#1e40af'
		},
		'.cm-cursor': {
			borderLeftColor: '#f8fafc'
		},
		'.cm-focused .cm-cursor': {
			borderLeftColor: '#0e7fe9'
		}
	});

	let scrollSyncTimeout: ReturnType<typeof setTimeout> | null = null;

	function throttleScrollSync(callback: () => void) {
		if (scrollSyncTimeout) {
			clearTimeout(scrollSyncTimeout);
		}
		scrollSyncTimeout = setTimeout(callback, 16);
	}

	function createScrollSyncExtension() {
		return EditorView.domEventHandlers({
			scroll() {
				if (onScrollSync) {
					throttleScrollSync(onScrollSync);
				}
			}
		});
	}

	function initializeEditor() {
		if (!editorElement) return;

		if (editorView) {
			editorView.destroy();
		}

		const state = EditorState.create({
			doc: content,
			extensions: [
				basicSetup,
				markdown(),
				theme === 'dark' ? darkTheme : lightTheme,
				drawSelection(),
				wikiLinksExtension(),
				hashtagExtension(),
				combinedAutocompletionExtension(),
				createScrollSyncExtension(),
				EditorView.updateListener.of((update) => {
					if (update.docChanged && onContentChange) {
						const newContent = update.state.doc.toString();
						onContentChange(newContent);
					}
				}),
				EditorView.lineWrapping,
				EditorState.readOnly.of(readonly),
				imagePasteExtension({
					onUploadStart: onUploadStart || (() => {}),
					onUploadProgress: onUploadProgress || (() => {}),
					onUploadComplete: onUploadComplete || (() => {}),
					onUploadError: onUploadError || (() => {})
				}),
				editorLayoutTheme
			]
		});

		editorView = new EditorView({
			state,
			parent: editorElement
		});
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

	export function setContentImmediate(newContent: string) {
		if (editorView) {
			editorView.dispatch({
				changes: {
					from: 0,
					to: editorView.state.doc.length,
					insert: newContent
				}
			});
		}
	}

	export function getEditorView() {
		return editorView;
	}

	export { formatText };

	onMount(() => {
		initializeEditor();
	});

	onDestroy(() => {
		if (editorView) {
			editorView.destroy();
		}
		if (scrollSyncTimeout) {
			clearTimeout(scrollSyncTimeout);
		}
	});

	// Reactive theme updates
	$effect(() => {
		if (editorView && theme) {
			const extensions = [
				basicSetup,
				markdown(),
				theme === 'dark' ? darkTheme : lightTheme,
				drawSelection(),
				wikiLinksExtension(),
				hashtagExtension(),
				combinedAutocompletionExtension(),
				createScrollSyncExtension(),
				EditorView.updateListener.of((update) => {
					if (update.docChanged && onContentChange) {
						const newContent = update.state.doc.toString();
						onContentChange(newContent);
					}
				}),
				EditorView.lineWrapping,
				EditorState.readOnly.of(readonly),
				imagePasteExtension({
					onUploadStart: onUploadStart || (() => {}),
					onUploadProgress: onUploadProgress || (() => {}),
					onUploadComplete: onUploadComplete || (() => {}),
					onUploadError: onUploadError || (() => {})
				}),
				editorLayoutTheme
			];

			editorView.dispatch({
				effects: StateEffect.reconfigure.of(extensions)
			});
		}
	});

	// Reactive content updates
	$effect(() => {
		if (editorView && content !== editorView.state.doc.toString()) {
			editorView.dispatch({
				changes: {
					from: 0,
					to: editorView.state.doc.length,
					insert: content
				}
			});
		}
	});
</script>

<div class="h-full overflow-hidden">
	<div bind:this={editorElement} class="h-full" data-testid="document-content-textarea"></div>
</div>

<style>
	/* Ensure CodeMirror fills the container */
	:global(.cm-editor) {
		height: 100% !important;
	}

	:global(.cm-scroller) {
		height: 100% !important;
	}

	/* Custom scrollbar for consistency */
	:global(.cm-scroller::-webkit-scrollbar) {
		width: 6px;
	}

	:global(.cm-scroller::-webkit-scrollbar-track) {
		background: transparent;
	}

	:global(.cm-scroller::-webkit-scrollbar-thumb) {
		background-color: rgba(156, 163, 175, 0.5);
		border-radius: 3px;
	}

	:global(.cm-scroller::-webkit-scrollbar-thumb:hover) {
		background-color: rgba(156, 163, 175, 0.7);
	}

	/* Force text selection visibility */
	:global(.cm-selectionBackground) {
		background-color: #3b82f6 !important;
		color: white !important;
		opacity: 1 !important;
		display: block !important;
		visibility: visible !important;
	}

	:global(.cm-focused .cm-selectionBackground) {
		background-color: #60a5fa !important;
		color: white !important;
	}

	:global(.cm-content) {
		user-select: text !important;
		-webkit-user-select: text !important;
		-moz-user-select: text !important;
	}

	/* Alternative selection styling using CSS pseudo-element */
	:global(.cm-content ::selection) {
		background-color: #3b82f6 !important;
		color: white !important;
	}

	:global(.cm-content ::-moz-selection) {
		background-color: #3b82f6 !important;
		color: white !important;
	}
</style>