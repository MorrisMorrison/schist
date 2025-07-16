<script lang="ts">
	import { onMount } from 'svelte';
	import { EditorView, basicSetup } from 'codemirror';
	import { markdown } from '@codemirror/lang-markdown';
	import { oneDark } from '@codemirror/theme-one-dark';
	import { EditorState } from '@codemirror/state';

	let {
		value = '',
		darkMode = false,
		onChange
	}: {
		value?: string;
		darkMode?: boolean;
		onChange?: (value: string) => void;
	} = $props();

	let editorContainer: HTMLDivElement;
	let editorView: EditorView;

	onMount(() => {
		const extensions = [
			basicSetup,
			markdown(),
			EditorView.theme({
				'&': {
					height: '100%',
					fontSize: '14px'
				},
				'.cm-content': {
					padding: '16px',
					minHeight: '400px'
				},
				'.cm-focused': {
					outline: 'none'
				},
				'.cm-editor': {
					borderRadius: '8px'
				}
			}),
			EditorView.updateListener.of((update) => {
				if (update.docChanged && onChange) {
					onChange(update.state.doc.toString());
				}
			})
		];

		if (darkMode) {
			extensions.push(oneDark);
		}

		const state = EditorState.create({
			doc: value,
			extensions
		});

		editorView = new EditorView({
			state,
			parent: editorContainer
		});

		return () => {
			editorView?.destroy();
		};
	});

	// Update editor content when value prop changes
	$effect(() => {
		if (editorView && value !== editorView.state.doc.toString()) {
			editorView.dispatch({
				changes: {
					from: 0,
					to: editorView.state.doc.length,
					insert: value
				}
			});
		}
	});

	export function focus() {
		editorView?.focus();
	}

	export function getValue(): string {
		return editorView?.state.doc.toString() || '';
	}
</script>

<div class="markdown-editor h-full w-full">
	<div
		bind:this={editorContainer}
		class="h-full min-h-[400px] overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-200"
	></div>
</div>

<style>
	:global(.cm-editor) {
		border: none !important;
	}

	:global(.cm-focused) {
		outline: none !important;
	}
</style>
