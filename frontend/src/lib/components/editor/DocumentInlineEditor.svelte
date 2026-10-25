<script lang="ts">
	// PROTOTYPE (issue #246): edit mode of the document page. Save, auto-save,
	// rename-by-first-heading and the unsaved-changes guard come from
	// DocumentEditView; the header/card/preview chrome is gone. DocumentView keeps
	// this mounted (hidden) after the first edit so the cursor, selection and undo
	// history survive switching to reading and back.
	import { onMount, onDestroy, untrack } from 'svelte';
	import ProseEditor from './ProseEditor.svelte';
	import EditorToolbar from './EditorToolbar.svelte';
	import UploadStatus from './UploadStatus.svelte';
	import UnsavedChangesModal from '$lib/components/modal/UnsavedChangesModal.svelte';
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import { useUnsavedChangesGuard } from '$lib/composables/useUnsavedChangesGuard.svelte.js';
	import { documentActions } from '$lib/stores/documents.svelte';
	import { generateSlug } from '$lib/utils/path';
	import { extractTitleFromContent, extractHashtagsFromContent } from '$lib/utils/content-parser';
	import { getErrorMessage } from '$lib/utils/error';
	import type { Asset, Document } from '$lib/api/types';

	interface Props {
		document: Document;
		onSaved: (document: Document) => void;
	}

	let { document: initialDocument, onSaved }: Props = $props();
	const document = untrack(() => initialDocument);

	let editor = $state<ProseEditor>();
	let currentPath = $state(untrack(() => document.metaData.path.replace(/^\/+/, '')));
	let content = $state(document.content);
	let originalContent = $state(document.content);
	let isSaving = $state(false);
	let saveError = $state('');
	let lastSaved = $state<Date | null>(null);
	let livePreview = $state(true);
	let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

	let isUploading = $state(false);
	let uploadProgress = $state(0);
	let uploadMessage = $state<string | null>(null);
	let uploadError = $state<string | null>(null);

	const isDirty = $derived(content !== originalContent);
	const title = $derived(extractTitleFromContent(content));

	const guard = useUnsavedChangesGuard({
		isDirty: () => isDirty,
		onSave: async () => {
			await save('manual');
		},
		onShowModal: () => {},
		onHideModal: () => {}
	});

	function replaceLastPathSegment(path: string, segment: string): string {
		const parts = path.split('/').filter(Boolean);
		if (parts.length === 0) return segment;
		parts[parts.length - 1] = segment;
		return parts.join('/');
	}

	function clearAutoSave() {
		if (autoSaveTimer) clearTimeout(autoSaveTimer);
		autoSaveTimer = null;
	}

	function handleChange(next: string) {
		content = next;
		clearAutoSave();
		if (isDirty) autoSaveTimer = setTimeout(() => save('auto'), 10000);
	}

	/** Saves if there is anything to save. Resolves false when the save failed. */
	export async function save(kind: 'manual' | 'auto' = 'manual'): Promise<boolean> {
		clearAutoSave();
		if (!isDirty) return true;
		if (!content.trim()) {
			saveError = 'Content is required';
			return false;
		}
		const slug = generateSlug(title);
		const newPath = replaceLastPathSegment(currentPath, slug);
		isSaving = true;
		saveError = '';
		try {
			if (newPath !== currentPath && (await documentActions.checkDocumentExists(newPath))) {
				saveError = `A document already exists at "${newPath}". Please choose a different title.`;
				return false;
			}
			const savedContent = content;
			const updated = await documentActions.updateDocumentByPath(
				currentPath,
				{
					...document,
					metaData: {
						...document.metaData,
						slug,
						path: newPath,
						title: title.trim(),
						tags: extractHashtagsFromContent(savedContent)
					},
					content: savedContent.trim()
				},
				kind
			);
			originalContent = savedContent;
			currentPath = newPath;
			lastSaved = new Date();
			onSaved({ ...updated, content: savedContent.trim() });
			return true;
		} catch (error) {
			saveError = getErrorMessage(error, 'Failed to save document');
			return false;
		} finally {
			isSaving = false;
		}
	}

	export function focus() {
		editor?.remeasure();
		editor?.focus();
	}

	onMount(() => guard.setupBrowserProtection());
	onDestroy(() => {
		clearAutoSave();
		guard.cleanupBrowserProtection();
	});
</script>

<div class="space-y-4">
	<div
		class="bg-background/90 border-border sticky top-0 z-10 -mx-2 flex items-center gap-2 border-b px-2 py-1 backdrop-blur"
	>
		<div
			class="min-w-0 flex-1 overflow-x-auto [&_.editor-toolbar]:min-h-0! [&_.editor-toolbar]:flex-nowrap! [&_.editor-toolbar]:gap-1! [&_.editor-toolbar]:border-0 [&_.editor-toolbar]:bg-transparent! [&_.editor-toolbar]:p-0! [&_.text-xs]:hidden"
		>
			<EditorToolbar onFormat={(type, value) => editor?.formatText(type, value)} />
		</div>
		<label class="text-muted-foreground flex items-center gap-1.5 text-xs whitespace-nowrap">
			<input type="checkbox" bind:checked={livePreview} data-testid="live-preview-toggle" />
			<span class="hidden sm:inline">Live preview</span><span class="sm:hidden">Live</span>
		</label>
		<span class="text-muted-foreground w-20 text-right sm:w-28 text-xs whitespace-nowrap">
			{#if isSaving}
				Saving…
			{:else if isDirty}
				<span data-testid="unsaved-indicator">Unsaved changes</span>
			{:else if lastSaved}
				<span data-testid="auto-saved">Saved {lastSaved.toLocaleTimeString()}</span>
			{:else}
				Saved
			{/if}
		</span>
	</div>

	{#if saveError}
		<ErrorAlert error={saveError} onDismiss={() => (saveError = '')} />
	{/if}

	<ProseEditor
		bind:this={editor}
		{content}
		{livePreview}
		onContentChange={handleChange}
		onSave={() => save('manual')}
		onUploadStart={() => {
			isUploading = true;
			uploadProgress = 0;
			uploadMessage = 'Starting upload...';
			uploadError = null;
		}}
		onUploadProgress={(p) => {
			uploadProgress = p;
			uploadMessage = `Uploading... ${Math.round(p)}%`;
		}}
		onUploadComplete={(asset: Asset) => {
			isUploading = false;
			uploadMessage = `Uploaded ${asset.original_name}`;
			setTimeout(() => (uploadMessage = null), 3000);
		}}
		onUploadError={(e) => {
			isUploading = false;
			uploadError = e;
			uploadMessage = null;
		}}
	/>

	<UploadStatus {isUploading} {uploadProgress} {uploadMessage} {uploadError} />
</div>

<UnsavedChangesModal
	open={guard.showModal}
	documentTitle={title}
	onSave={guard.handleSave}
	onDiscard={guard.handleDiscard}
	onCancel={guard.handleCancel}
	isSaving={guard.isSaving}
/>
