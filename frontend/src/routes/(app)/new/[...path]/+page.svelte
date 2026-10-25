<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount, onDestroy } from 'svelte';
	import LazyProseEditor from '$lib/components/editor/LazyProseEditor.svelte';
	import EditorToolbar from '$lib/components/editor/EditorToolbar.svelte';
	import MarkdownPreview from '$lib/components/editor/MarkdownPreview.svelte';
	import ModeToggle from '$lib/components/editor/ModeToggle.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { documentActions } from '$lib/stores/documents.svelte';
	import { generateSlug, normalizePath } from '$lib/utils/path';
	import { BookOpen, Check, Loader2, Pencil } from '@lucide/svelte';
	import type { DocumentMode } from '$lib/types/editor';
	import type { PageData } from './$types';
	import MarkdownInfoHelp from '$lib/components/editor/MarkdownInfoHelp.svelte';
	import { extractTitleFromContent, extractHashtagsFromContent } from '$lib/utils/content-parser';
	import { templatesStore, templateActions } from '$lib/stores/templates.svelte';
	import type { Template } from '$lib/api/types';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import { useDocumentExistence } from '$lib/composables/useDocumentExistence.svelte';
	import UnsavedChangesModal from '$lib/components/modal/UnsavedChangesModal.svelte';
	import { useUnsavedChangesGuard } from '$lib/composables/useUnsavedChangesGuard.svelte.js';
	import { getErrorMessage } from '$lib/utils/error';

	let { data }: { data: PageData } = $props();

	const initialContent = '# New Document\n\n';
	// "New Document" starts selected, so typing replaces it with the real title.
	const TITLE_PLACEHOLDER = { anchor: 2, head: 14 };
	let content = $state(initialContent);
	let isCreating = $state(false);
	let createError = $state('');
	let editorRef = $state<LazyProseEditor>();
	// A new document starts in the editor; Preview shows the rendered draft.
	let mode = $state<DocumentMode>('edit');

	const documentExistence = useDocumentExistence();

	// Track original content for dirty state - tracks what was last "saved"
	let originalContent = $state(initialContent);

	const title = $derived(extractTitleFromContent(content));
	const isDirty = $derived(content !== originalContent);

	// Navigation guard for unsaved changes
	const navigationGuard = useUnsavedChangesGuard({
		isDirty: () => isDirty,
		onSave: handleCreate,
		onShowModal: () => {
			// Modal state is managed by the guard
		},
		onHideModal: () => {
			// Modal state is managed by the guard
		}
	});

	$effect(() => {
		templateActions.loadTemplates();
	});

	$effect(() => {
		if (title.trim()) {
			const fullPath = generatePath(title);
			documentExistence.checkExistence(fullPath);
		} else {
			documentExistence.reset();
		}

		return () => {
			documentExistence.cleanup();
		};
	});

	async function handleCreate() {
		if (!content.trim()) {
			createError = 'Content is required';
			return;
		}

		isCreating = true;
		createError = '';

		try {
			const tags = extractHashtagsFromContent(content);
			const fullPath = generatePath(title);

			const exists = await documentActions.checkDocumentExists(fullPath);
			if (exists) {
				createError = `A document already exists at "${fullPath}". Please choose a different title.`;
				isCreating = false;
				return;
			}

			const response = await documentActions.createDocument({
				metaData: {
					path: normalizePath(fullPath),
					title: title.trim(),
					tags: tags
				},
				content: content.trim()
			});

			// Update originalContent to mark as saved
			originalContent = content;

			goto(`/documents${response.metaData.path}`);
		} catch (error) {
			console.error('Failed to create page:', error);
			createError = getErrorMessage(error, 'Failed to create page');
		} finally {
			isCreating = false;
		}
	}

	function handleContentChange(newContent: string) {
		content = newContent;
	}

	function setMode(next: DocumentMode) {
		mode = next;
		if (next === 'edit') {
			requestAnimationFrame(() => {
				editorRef?.remeasure();
				editorRef?.focus();
			});
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		const mod = event.ctrlKey || event.metaKey;
		if (mod && event.key === 's') {
			event.preventDefault();
			handleCreate();
		}
		if (mod && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'e') {
			event.preventDefault();
			setMode(mode === 'edit' ? 'read' : 'edit');
		}
		if (event.key === 'Escape' && navigationGuard.showModal) {
			navigationGuard.handleCancel();
		}
	}

	// Set up browser protection for page close/reload
	onMount(() => {
		navigationGuard.setupBrowserProtection();
	});

	onDestroy(() => {
		navigationGuard.cleanupBrowserProtection();
	});

	function generatePath(title: string): string {
		const slug = generateSlug(title);
		if (!data.path || data.path === '/') {
			return `/${slug}`;
		}
		const cleanPath = data.path.startsWith('/') ? data.path : `/${data.path}`;
		const trimmedPath = cleanPath.endsWith('/') ? cleanPath.slice(0, -1) : cleanPath;
		return `${trimmedPath}/${slug}`;
	}

	function applyTemplate(template: Template) {
		let templateContent = template.content;

		const now = new Date();
		const title = extractTitleFromContent(content) || template.title;

		templateContent = templateContent
			.replace(/\{\{date\}\}/g, now.toISOString().split('T')[0])
			.replace(/\{\{time\}\}/g, now.toTimeString().split(' ')[0])
			.replace(/\{\{title\}\}/g, title)
			.replace(
				/\{\{next_date\}\}/g,
				new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
			);

		content = templateContent;
		// Update originalContent to reflect the new template as baseline
		originalContent = templateContent;

		editorRef?.setContent(templateContent);
		setMode('edit');
	}
</script>

<svelte:head>
	<title>Create New Document - Schist</title>
	<meta name="description" content="Create a new document" />
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="mx-auto max-w-[55rem] space-y-8 p-6">
	<header
		class="border-border flex flex-col gap-4 border-b pb-6 md:flex-row md:items-center md:justify-between"
	>
		<div>
			<p class="text-muted-foreground text-sm">New document</p>
			<p class="text-muted-foreground mt-1 text-xs" data-testid="new-document-path">
				Will be saved as <span class="font-mono">{generatePath(title)}</span>
			</p>
		</div>

		<div class="flex items-center gap-2">
			<ModeToggle
				{mode}
				onSelect={setMode}
				options={[
					{
						mode: 'edit',
						label: 'Write',
						title: 'Write (Ctrl+E)',
						icon: Pencil,
						testId: 'edit-mode-button'
					},
					{
						mode: 'read',
						label: 'Preview',
						title: 'Preview (Ctrl+E)',
						icon: BookOpen,
						testId: 'preview-mode-button'
					}
				]}
			/>
			<Button href="/" data-testid="cancel-button" variant="outline" size="sm">Cancel</Button>
			<Button
				data-testid="save-document-button"
				size="sm"
				onclick={handleCreate}
				disabled={isCreating || !content.trim() || documentExistence.exists}
			>
				{#if isCreating}
					<Loader2 class="h-4 w-4 animate-spin"></Loader2>
					Creating...
				{:else}
					<Check class="h-4 w-4"></Check>
					Save Document
				{/if}
			</Button>
		</div>
	</header>

	<!-- Error Message -->
	{#if createError}
		<ErrorAlert error={createError} onDismiss={() => (createError = '')} />
	{/if}

	<!-- Existence Warning -->
	{#if documentExistence.warning}
		<ErrorAlert
			error={documentExistence.warning}
			variant="warning"
			onDismiss={() => documentExistence.reset()}
		/>
	{/if}

	<!-- The editor stays mounted while previewing, so cursor and undo survive. -->
	<div class:hidden={mode !== 'edit'}>
		<div
			class="bg-background/95 border-border sticky top-0 z-10 mb-6 border-b py-1.5 backdrop-blur"
		>
			<EditorToolbar onFormat={(type, value) => editorRef?.formatText(type, value)} />
		</div>
		<div class="max-w-[70ch]">
			<LazyProseEditor
				bind:this={editorRef}
				{content}
				autofocus
				initialSelection={TITLE_PLACEHOLDER}
				onContentChange={handleContentChange}
				onSave={handleCreate}
			/>
		</div>
	</div>

	{#if mode === 'read'}
		<MarkdownPreview {content} />
	{/if}

	<!-- Template Suggestions -->
	<div class="bg-content rounded-lg p-6">
		<h3 class="text-primary mb-4 text-lg font-medium">Quick Start Templates</h3>

		{#if templatesStore.loading}
			<div class="flex items-center justify-center py-8">
				<LoadingSpinner size="lg" />
				<span class="text-secondary ml-3">Loading templates...</span>
			</div>
		{:else if templatesStore.error}
			<div class="py-8 text-center">
				<p class="text-red-600">Error: {templatesStore.error}</p>
				<Button
					variant="link"
					size="sm"
					class="mt-2"
					onclick={() => templateActions.loadTemplates(true)}
				>
					Retry
				</Button>
			</div>
		{:else if templatesStore.templates.length === 0}
			<div class="py-8 text-center">
				<p class="text-secondary">No templates available</p>
			</div>
		{:else}
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each templatesStore.templates as template (template.id)}
					<button
						type="button"
						onclick={() => applyTemplate(template)}
						class="border-primary bg-primary hover:border-secondary rounded-lg border p-4 text-left hover:shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none"
					>
						<h4 class="text-primary font-medium">{template.title}</h4>
						<p class="text-secondary mt-1 text-sm">{template.description}</p>
						{#if template.tags && template.tags.length > 0}
							<div class="mt-2 flex flex-wrap gap-1">
								{#each template.tags.slice(0, 2) as tag (tag)}
									<Badge variant="secondary">{tag}</Badge>
								{/each}
								{#if template.tags.length > 2}
									<span class="text-secondary text-xs">+{template.tags.length - 2} more</span>
								{/if}
							</div>
						{/if}
					</button>
				{/each}
			</div>
		{/if}
	</div>

	<MarkdownInfoHelp showTaskExample={true} />
</div>

<!-- Unsaved Changes Modal -->
<UnsavedChangesModal
	open={navigationGuard.showModal}
	documentTitle={title}
	onSave={navigationGuard.handleSave}
	onDiscard={navigationGuard.handleDiscard}
	onCancel={navigationGuard.handleCancel}
	isSaving={navigationGuard.isSaving}
/>
