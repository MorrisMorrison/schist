<script lang="ts">
	import { pageContainerVariants } from '#lib/components/ui/page-container/index.ts';
	// Edit mode of the document page: the markdown in the reading column, with a
	// slim toolbar and save status above it. DocumentView keeps this mounted
	// (hidden) while reading, so cursor, selection and undo survive the toggle.
	import { onMount, onDestroy, untrack } from 'svelte';
	import LazyProseEditor from './LazyProseEditor.svelte';
	import EditorToolbar from './EditorToolbar.svelte';
	import UploadStatus from './UploadStatus.svelte';
	import UnsavedChangesModal from '#lib/components/modal/UnsavedChangesModal.svelte';
	import ErrorAlert from '#lib/components/ErrorAlert.svelte';
	import { useUnsavedChangesGuard } from '#lib/composables/useUnsavedChangesGuard.svelte.ts';
	import { useDocumentDraft, type SaveKind } from '#lib/composables/useDocumentDraft.svelte.ts';
	import { useDocumentExistence } from '#lib/composables/useDocumentExistence.svelte.ts';
	import { documentPageWidth, settings } from '#lib/stores/settings.svelte.ts';
	import type { Asset, Document } from '#lib/api/types.ts';

	interface Props {
		document: Document;
		/** After every successful save, with the stored document. */
		onSaved?: (document: Document) => void;
		autofocus?: boolean;
	}

	let { document, onSaved, autofocus = false }: Props = $props();

	let editor = $state<LazyProseEditor>();
	let focusMode = $state(settings.app.alwaysOpenFullscreen);

	const draft = useDocumentDraft({
		document: untrack(() => document),
		onSaved: (saved) => onSaved?.(saved)
	});
	const existence = useDocumentExistence();

	let isUploading = $state(false);
	let uploadProgress = $state(0);
	let uploadMessage = $state<string | null>(null);
	let uploadError = $state<string | null>(null);

	const guard = useUnsavedChangesGuard({
		isDirty: () => draft.isDirty,
		// Throwing keeps the modal open, so a failed save never navigates away.
		onSave: async () => {
			if (!(await draft.save('manual'))) throw new Error(draft.error);
		},
		onShowModal: () => {},
		onHideModal: () => {}
	});

	// Warn while typing a title whose path is taken (the save refuses it too).
	$effect(() => {
		const target = draft.targetPath;
		const current = draft.path;
		if (draft.title.trim()) existence.checkExistence(target, current);
		else existence.reset();
		return () => existence.cleanup();
	});

	export function save(kind: SaveKind = 'manual'): Promise<boolean> {
		return draft.save(kind);
	}

	export function isDirty(): boolean {
		return draft.isDirty;
	}

	export function discardChanges() {
		draft.discard();
	}

	/** Called when edit mode is shown again. */
	export function focus() {
		editor?.remeasure();
		editor?.focus();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'F11') {
			event.preventDefault();
			focusMode = !focusMode;
		} else if (event.key === 'Escape' && focusMode && !guard.showModal) {
			focusMode = false;
		} else if (event.key === 'Escape' && guard.showModal) {
			guard.handleCancel();
		}
	}

	onMount(() => guard.setupBrowserProtection());
	onDestroy(() => {
		draft.dispose();
		guard.cleanupBrowserProtection();
	});
</script>

<svelte:window onkeydown={handleKeydown} />

<div
	class={focusMode ? 'bg-background fixed inset-0 z-50 overflow-y-auto' : ''}
	data-testid="document-editor"
	role={focusMode ? 'dialog' : undefined}
	aria-modal={focusMode ? true : undefined}
	aria-label={focusMode ? 'Focus mode' : undefined}
>
	<div
		class={focusMode
			? pageContainerVariants({ width: documentPageWidth(), class: 'space-y-0 pt-0' })
			: ''}
	>
		<div
			class="bg-background/95 border-border sticky top-0 z-10 mb-6 flex items-center gap-3 border-b py-1.5 backdrop-blur"
		>
			<div class="min-w-0 flex-1">
				<EditorToolbar
					onFormat={(type, value) => editor?.formatText(type, value)}
					onFullscreenToggle={() => (focusMode = !focusMode)}
					isFullscreen={focusMode}
				/>
			</div>
			<span
				class="text-muted-foreground shrink-0 text-xs whitespace-nowrap"
				role="status"
				data-testid="save-status"
			>
				{#if draft.isSaving}
					Saving…
				{:else if draft.isDirty}
					<span data-testid="unsaved-indicator">Unsaved changes</span>
				{:else if draft.lastSaved}
					<span data-testid="auto-saved">Saved {draft.lastSaved.toLocaleTimeString()}</span>
				{:else}
					Saved
				{/if}
			</span>
		</div>

		{#if draft.error}
			<div class="mb-4">
				<ErrorAlert error={draft.error} onDismiss={() => (draft.error = '')} />
			</div>
		{/if}

		{#if existence.warning}
			<div class="mb-4">
				<ErrorAlert
					error={existence.warning}
					variant="warning"
					onDismiss={() => existence.reset()}
				/>
			</div>
		{/if}

		<div>
			<LazyProseEditor
				bind:this={editor}
				content={draft.content}
				{autofocus}
				onContentChange={draft.setContent}
				onSave={() => draft.save('manual')}
				onUploadStart={() => {
					isUploading = true;
					uploadProgress = 0;
					uploadMessage = 'Starting upload...';
					uploadError = null;
				}}
				onUploadProgress={(progress) => {
					uploadProgress = progress;
					uploadMessage = `Uploading... ${Math.round(progress)}%`;
				}}
				onUploadComplete={(asset: Asset) => {
					isUploading = false;
					uploadMessage = `Uploaded ${asset.original_name}`;
					setTimeout(() => (uploadMessage = null), 3000);
				}}
				onUploadError={(error) => {
					isUploading = false;
					uploadError = error;
					uploadMessage = null;
					setTimeout(() => (uploadError = null), 5000);
				}}
			/>
		</div>

		<UploadStatus {isUploading} {uploadProgress} {uploadMessage} {uploadError} />
	</div>
</div>

<UnsavedChangesModal
	open={guard.showModal}
	documentTitle={draft.title}
	onSave={guard.handleSave}
	onDiscard={guard.handleDiscard}
	onCancel={guard.handleCancel}
	isSaving={guard.isSaving}
/>
