<script lang="ts">
	// The markdown editor: CodeMirror without gutters or line numbers, in the
	// reading view's column, font and heading sizes. It grows with its content, so
	// the page scrolls rather than a box inside it. Load it through
	// LazyProseEditor so CodeMirror stays out of the reading view's bundle.
	import { onMount, onDestroy, untrack } from 'svelte';
	import { EditorView, keymap, drawSelection, dropCursor } from '@codemirror/view';
	import { EditorState } from '@codemirror/state';
	import { history, defaultKeymap, historyKeymap, indentWithTab } from '@codemirror/commands';
	import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
	import { indentOnInput } from '@codemirror/language';
	import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
	import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
	import { imagePasteExtension } from '$lib/utils/image-paste.js';
	import { wikiLinksExtension } from '$lib/utils/wiki-links.js';
	import { hashtagExtension } from '$lib/utils/hashtag-extension.js';
	import { combinedAutocompletionExtension } from '$lib/utils/combined-autocomplete.js';
	import { proseMarkdown } from '$lib/utils/prose-markdown';
	import { applyFormatting } from '$lib/utils/editor-formatting';
	import type { FormattingType, ProseEditorProps } from '$lib/types/editor';

	let {
		content = '',
		autofocus = false,
		initialSelection,
		onContentChange,
		onSave,
		onUploadStart,
		onUploadProgress,
		onUploadComplete,
		onUploadError
	}: ProseEditorProps = $props();

	let host: HTMLElement;
	let view: EditorView | null = null;

	function format(type: FormattingType) {
		return () => {
			formatText(type);
			return true;
		};
	}

	onMount(() => {
		view = new EditorView({
			parent: host,
			state: EditorState.create({
				// The editor owns the text from here on; later prop changes are ignored
				// (use setContent to replace it).
				doc: untrack(() => content),
				selection: untrack(() => initialSelection),
				extensions: [
					history(),
					drawSelection(),
					dropCursor(),
					indentOnInput(),
					closeBrackets(),
					highlightSelectionMatches(),
					markdown({ base: markdownLanguage }),
					EditorView.lineWrapping,
					EditorView.contentAttributes.of({ 'aria-label': 'Document content' }),
					keymap.of([
						{
							key: 'Mod-s',
							preventDefault: true,
							run: () => {
								onSave?.();
								return true;
							}
						},
						{ key: 'Mod-b', run: format('bold') },
						{ key: 'Mod-i', run: format('italic') },
						{ key: 'Mod-1', run: format('heading1') },
						{ key: 'Mod-2', run: format('heading2') },
						{ key: 'Mod-3', run: format('heading3') },
						{ key: 'Mod-k', run: format('link') },
						{ key: 'Mod-Shift-k', run: format('wikiLink') },
						{ key: 'Mod-`', run: format('code') },
						...closeBracketsKeymap,
						...defaultKeymap,
						...searchKeymap,
						...historyKeymap,
						indentWithTab
					]),
					wikiLinksExtension(),
					hashtagExtension(),
					combinedAutocompletionExtension(),
					imagePasteExtension({
						onUploadStart: () => onUploadStart?.(),
						onUploadProgress: (progress) => onUploadProgress?.(progress),
						onUploadComplete: (asset) => onUploadComplete?.(asset),
						onUploadError: (error) => onUploadError?.(error)
					}),
					proseMarkdown(),
					EditorView.updateListener.of((update) => {
						if (update.docChanged) onContentChange?.(update.state.doc.toString());
					})
				]
			})
		});
		if (untrack(() => autofocus)) view.focus();
	});

	onDestroy(() => view?.destroy());

	export function formatText(type: FormattingType, value?: string) {
		if (view) applyFormatting(view, type, value);
	}

	/** Replaces the whole text (e.g. a template), as one undoable change. */
	export function setContent(next: string) {
		view?.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
	}

	export function focus() {
		view?.focus();
	}

	/** CodeMirror can't measure while hidden; call after showing it again. */
	export function remeasure() {
		view?.requestMeasure();
	}
</script>

<div bind:this={host} class="prose-editor reading" data-testid="document-content-textarea"></div>
