<script lang="ts">
	// PROTOTYPE (issue #246): the single-pane editor. Same column, font and heading
	// sizes as the reading view; no gutters or line numbers; grows with its content
	// so the page scrolls, not the editor. `livePreview` switches between source
	// (prose-styled) and Obsidian-style live preview without recreating the view.
	import { onMount, onDestroy } from 'svelte';
	import { EditorView, keymap, drawSelection, dropCursor } from '@codemirror/view';
	import { EditorState, Compartment } from '@codemirror/state';
	import { history, defaultKeymap, historyKeymap, indentWithTab } from '@codemirror/commands';
	import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
	import { indentOnInput } from '@codemirror/language';
	import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
	import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
	import { imagePasteExtension } from '$lib/utils/image-paste.js';
	import { hashtagExtension } from '$lib/utils/hashtag-extension.js';
	import { combinedAutocompletionExtension } from '$lib/utils/combined-autocomplete.js';
	import {
		livePreview as livePreviewExt,
		proseMarkdown,
		proseTheme
	} from '$lib/utils/live-preview';
	import type { FormattingType } from '$lib/types/editor';

	interface Props {
		content: string;
		livePreview?: boolean;
		onContentChange?: (content: string) => void;
		onSave?: () => void;
		onUploadStart?: () => void;
		onUploadProgress?: (progress: number) => void;
		onUploadComplete?: (asset: import('$lib/api/types').Asset) => void;
		onUploadError?: (error: string) => void;
	}

	let {
		content,
		livePreview = true,
		onContentChange,
		onSave,
		onUploadStart,
		onUploadProgress,
		onUploadComplete,
		onUploadError
	}: Props = $props();

	let host: HTMLElement;
	let view: EditorView | null = null;
	const mode = new Compartment();

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
				doc: content,
				extensions: [
					history(),
					drawSelection(),
					dropCursor(),
					indentOnInput(),
					closeBrackets(),
					highlightSelectionMatches(),
					markdown({ base: markdownLanguage }),
					EditorView.lineWrapping,
					keymap.of([
						{ key: 'Mod-s', run: () => (onSave?.(), true), preventDefault: true },
						{ key: 'Mod-b', run: format('bold') },
						{ key: 'Mod-i', run: format('italic') },
						{ key: 'Mod-k', run: format('link') },
						{ key: 'Mod-Shift-k', run: format('wikiLink') },
						{ key: 'Mod-`', run: format('code') },
						...closeBracketsKeymap,
						...defaultKeymap,
						...searchKeymap,
						...historyKeymap,
						indentWithTab
					]),
					hashtagExtension(),
					combinedAutocompletionExtension(),
					imagePasteExtension({
						onUploadStart: onUploadStart ?? (() => {}),
						onUploadProgress: onUploadProgress ?? (() => {}),
						onUploadComplete: onUploadComplete ?? (() => {}),
						onUploadError: onUploadError ?? (() => {})
					}),
					proseTheme,
					mode.of(livePreview ? livePreviewExt() : proseMarkdown()),
					EditorView.updateListener.of((update) => {
						if (update.docChanged) onContentChange?.(update.state.doc.toString());
					})
				]
			})
		});
	});

	onDestroy(() => view?.destroy());

	$effect(() => {
		const live = livePreview;
		view?.dispatch({ effects: mode.reconfigure(live ? livePreviewExt() : proseMarkdown()) });
	});

	export function focus() {
		view?.focus();
	}

	/** Hidden while reading; CodeMirror needs a re-measure once shown again. */
	export function remeasure() {
		view?.requestMeasure();
	}

	// Same behaviour as EditorContent.formatText (would move to a shared util).
	export function formatText(type: FormattingType, value?: string) {
		if (!view) return;
		const selection = view.state.selection.main;
		const selected = view.state.doc.sliceString(selection.from, selection.to);
		let replacement = '';
		let cursorOffset = 0;
		switch (type) {
			case 'bold':
				replacement = `**${selected || 'bold text'}**`;
				cursorOffset = selected ? 0 : -2;
				break;
			case 'italic':
				replacement = `*${selected || 'italic text'}*`;
				cursorOffset = selected ? 0 : -1;
				break;
			case 'heading1':
				replacement = `# ${selected || 'Heading 1'}`;
				break;
			case 'heading2':
				replacement = `## ${selected || 'Heading 2'}`;
				break;
			case 'heading3':
				replacement = `### ${selected || 'Heading 3'}`;
				break;
			case 'bulletList':
				replacement = `- ${selected || 'List item'}`;
				break;
			case 'numberedList':
				replacement = `1. ${selected || 'List item'}`;
				break;
			case 'link': {
				const url = value || 'https://example.com';
				replacement = `[${selected || 'link text'}](${url})`;
				cursorOffset = selected ? 0 : -url.length - 1;
				break;
			}
			case 'wikiLink':
				replacement = `[[${selected || 'Document Name'}]]`;
				cursorOffset = selected ? 0 : -2;
				break;
			case 'code':
				replacement = `\`${selected || 'code'}\``;
				cursorOffset = selected ? 0 : -1;
				break;
			case 'quote':
				replacement = `> ${selected || 'Quote'}`;
				break;
		}
		view.dispatch({
			changes: { from: selection.from, to: selection.to, insert: replacement },
			selection: cursorOffset
				? { anchor: selection.from + replacement.length + cursorOffset }
				: undefined
		});
		view.focus();
	}
</script>

<div
	bind:this={host}
	class="prose-editor reading max-w-[70ch]"
	data-testid="document-content-textarea"
></div>

<style>
	/* EditorContent forces a fixed-height, inner-scrolling editor globally. */
	.prose-editor :global(.cm-editor),
	.prose-editor :global(.cm-scroller) {
		height: auto !important;
	}
</style>
