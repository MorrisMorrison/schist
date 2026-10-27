<script lang="ts">
	import { documentPageWidth } from '#lib/stores/settings.svelte.ts';
	import { PageContainer } from '#lib/components/ui/page-container/index.ts';
	import { formatLongDate } from '#lib/utils/date.ts';
	import {
		BookOpen,
		Calendar,
		Download,
		Edit,
		Ellipsis,
		GitBranch,
		History,
		Link2,
		Pencil,
		Share,
		Tag,
		Trash2
	} from '@lucide/svelte';
	import { tick } from 'svelte';
	import { Button, buttonVariants } from '#lib/components/ui/button/index.ts';
	import { Badge } from '#lib/components/ui/badge/index.ts';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.ts';
	import Breadcrumbs from '../Breadcrumbs.svelte';
	import DeleteConfirmModal from '../modal/DeleteConfirmModal.svelte';
	import VersionHistoryModal from '../VersionHistoryModal.svelte';
	import ShareDocumentModal from '../modal/ShareDocumentModal.svelte';
	import { initializeMarkdownInteractions } from '#lib/utils/markdown-blocks.ts';
	import MarkdownRenderer from '#lib/components/markdown/MarkdownRenderer.svelte';
	import type { Document, DocumentVersion } from '#lib/api/types.ts';
	import ImageLightbox from '../ImageLightbox.svelte';
	import { imageLightbox, imageLightboxActions } from '#lib/stores/image-lightbox.svelte.ts';
	import { apiClient } from '#lib/api/client.ts';
	import { goto } from '$app/navigation';
	import { useOptimizedLoading } from '#lib/composables/useOptimizedLoading.svelte.ts';
	import {
		secretStore,
		replaceSecretPlaceholders,
		markLockedSecretPlaceholders
	} from '#lib/stores/secrets.svelte.ts';
	import { processHashtags } from '#lib/utils/hashtag-renderer.ts';
	import { stripLeadingTitleHeading } from '#lib/utils/document-title.ts';
	import LazyDocumentGraphView from './LazyDocumentGraphView.svelte';
	import DocumentGraphToggle from './DocumentGraphToggle.svelte';
	import ModeToggle from '../editor/ModeToggle.svelte';
	import { documentActions, linksStore } from '#lib/stores/documents.svelte.ts';
	import type { DocumentMode } from '#lib/types/editor.ts';
	import type DocumentInlineEditorComponent from '../editor/DocumentInlineEditor.svelte';

	interface Props {
		document: Document;
		/** Reading the rendered page or editing it in place. */
		mode?: DocumentMode;
		/** After the mode changed (the page mirrors it in the URL). */
		onModeChange?: (mode: DocumentMode) => void;
		/** After every save from edit mode, with the stored document. */
		onSaved?: (document: Document) => void;
		onDelete?: (slug: string) => void | Promise<void>;
	}

	let {
		document,
		mode = $bindable('read'),
		onModeChange = () => {},
		onSaved = () => {},
		onDelete = () => {}
	}: Props = $props();

	// The editor is loaded the first time edit mode opens and then stays mounted
	// while reading, so cursor, selection and undo history survive the toggle.
	let editorRequested = $state(false);
	let inlineEditor = $state<DocumentInlineEditorComponent>();
	let editorContainer = $state<HTMLDivElement>();
	let editorImport: Promise<typeof import('../editor/DocumentInlineEditor.svelte')> | null = null;
	// One promise for the component's lifetime: a new one would remount the editor.
	const loadEditor = () => (editorImport ??= import('../editor/DocumentInlineEditor.svelte'));
	const editorModule = $derived(editorRequested || mode === 'edit' ? loadEditor() : null);
	// Focus the editor when it first appears because the user asked for it, not
	// when the page opened straight into edit mode from a link.
	let focusOnLoad = $state(false);
	let switching = false;

	$effect(() => {
		if (mode === 'edit') editorRequested = true;
	});

	let showDeleteModal = $state(false);
	let isDeleting = $state(false);
	let showShareModal = $state(false);

	const documentPath = $derived(document.metaData?.path || `/${document.metaData?.slug}`);
	const documentTitle = $derived(document.metaData?.title || 'Untitled');
	const documentCreated = $derived(document.metaData?.created);
	const documentUpdated = $derived(document.metaData?.updated);
	const documentTags = $derived(document.metaData?.tags || []);

	let contentContainer = $state<HTMLDivElement>();
	let viewRoot = $state<HTMLElement | null>(null);

	function scroller(): HTMLElement | null {
		return (
			(viewRoot?.closest('.main-content') as HTMLElement | null) ??
			(window.document.scrollingElement as HTMLElement | null)
		);
	}

	/** How far (0..1) the window has scrolled into `el`, or null above its top. */
	function scrolledInto(el: HTMLElement | undefined): number | null {
		const s = scroller();
		if (!el || !s) return null;
		const rect = el.getBoundingClientRect();
		const offset = s.getBoundingClientRect().top - rect.top;
		if (offset <= 0 || rect.height <= 0) return null;
		return Math.min(offset / rect.height, 1);
	}

	function scrollInto(el: HTMLElement | undefined, fraction: number | null) {
		const s = scroller();
		if (!el || !s || fraction === null) return;
		const rect = el.getBoundingClientRect();
		s.scrollTop += rect.top - s.getBoundingClientRect().top + fraction * rect.height;
	}

	/**
	 * Switches between reading and editing. Leaving edit mode saves first and
	 * stays put if that fails, so the reading view never hides unsaved text.
	 * The scroll position carries over proportionally (same column, same type).
	 */
	export async function setMode(next: DocumentMode) {
		if (next === mode || switching) return;
		switching = true;
		try {
			if (next === 'read' && inlineEditor && !(await inlineEditor.save('manual'))) return;
			const fraction = scrolledInto(mode === 'edit' ? editorContainer : contentContainer);
			if (next === 'edit' && !inlineEditor) focusOnLoad = true;
			mode = next;
			onModeChange(next);
			await tick();
			if (next === 'edit') inlineEditor?.focus();
			// After the browser has laid out the newly shown view.
			requestAnimationFrame(() =>
				scrollInto(next === 'edit' ? editorContainer : contentContainer, fraction)
			);
		} finally {
			switching = false;
		}
	}

	function anyModalOpen() {
		return showDeleteModal || showShareModal || showVersionHistory;
	}

	function handleModeShortcut(event: KeyboardEvent) {
		const mod = event.ctrlKey || event.metaKey;
		if (!mod || event.altKey || event.shiftKey || event.key.toLowerCase() !== 'e') return;
		if (anyModalOpen()) return;
		event.preventDefault();
		setMode(mode === 'edit' ? 'read' : 'edit');
	}

	// A document can link to the same page several times; list each target once
	// (the list below is keyed by path, and duplicate keys throw).
	const validOutgoingLinks = $derived.by(() => {
		const seen = new Set<string>();
		return (linksStore.outgoingLinks ?? []).filter((link) => {
			if (!link.is_valid || seen.has(link.path)) return false;
			seen.add(link.path);
			return true;
		});
	});

	let processedContent = $state('');

	let graphViewMode = $state<'list' | 'graph'>('graph');
	const backlinkLoader = useOptimizedLoading(200, 150);

	let versionCount = $state<number | undefined>(undefined);
	const versionLoader = useOptimizedLoading(200, 150);

	let showVersionHistory = $state(false);
	let versions = $state<DocumentVersion[]>([]);

	function addSecretPlaceholderIndicators(text: string): string {
		return processHashtags(markLockedSecretPlaceholders(text));
	}

	$effect(() => {
		// The header already shows the title; don't render it twice.
		const content = stripLeadingTitleHeading(document.content ?? '', documentTitle);
		const unlocked = secretStore.secretsUnlocked;
		// Secret lookup is async: drop the result if the document or lock state
		// changed meanwhile, so an older document never overwrites a newer one.
		let stale = false;

		async function processContent() {
			if (!content) {
				processedContent = '';
				return;
			}

			let result: string;
			try {
				if (unlocked) {
					const processedText = await replaceSecretPlaceholders(content, (key: string) =>
						secretStore.getSecret(key)
					);
					result = processHashtags(processedText);
				} else {
					result = addSecretPlaceholderIndicators(content);
				}
			} catch (error) {
				console.error('Failed to process document content:', error);
				result = content;
			}
			if (!stale) processedContent = result;
		}

		processContent();
		return () => {
			stale = true;
		};
	});

	$effect(() => {
		if (contentContainer && processedContent) {
			setTimeout(() => {
				if (contentContainer) {
					initializeMarkdownInteractions(contentContainer);
				}
			}, 0);
		}
	});

	$effect(() => {
		if (documentPath) {
			backlinkLoader.startLoading();
			documentActions.loadBacklinks(documentPath).finally(() => {
				backlinkLoader.stopLoading();
			});

			documentActions.loadOutgoingLinks(documentPath);
		}
	});

	async function refreshVersionCount() {
		if (!documentPath) return;

		versionLoader.startLoading();
		try {
			const versionsResponse = await apiClient.getDocumentVersions(documentPath);
			versionCount = versionsResponse.total || 0;
		} catch (error) {
			console.error('Failed to load version count:', error);
			// Set to 0 for new documents or when versions can't be loaded
			versionCount = 0;
		} finally {
			versionLoader.stopLoading();
		}
	}

	$effect(() => {
		void documentPath;
		void documentUpdated;

		refreshVersionCount();
	});

	function handleDeleteClick() {
		showDeleteModal = true;
	}

	async function handleConfirmDelete() {
		isDeleting = true;

		try {
			// The document is going away; don't let the unsaved-changes guard stop that.
			inlineEditor?.discardChanges();
			const result = onDelete(documentPath);
			if (result && typeof result.then === 'function') {
				await result;
			}
			showDeleteModal = false;
		} catch (error) {
			console.error('Failed to delete document:', error);
		} finally {
			isDeleting = false;
		}
	}

	function handleCancelDelete() {
		showDeleteModal = false;
		isDeleting = false;
	}

	async function handleVersionHistoryClick() {
		if (!documentPath) return;

		showVersionHistory = true;

		// Always reload: the component is reused across documents and saves, so a
		// cached list could belong to another document or be out of date.
		const path = documentPath;
		try {
			const versionsResponse = await apiClient.getDocumentVersions(path);
			if (path === documentPath) versions = versionsResponse.versions || [];
		} catch (error) {
			console.error('Failed to load versions:', error);
			if (path === documentPath) versions = [];
		}
	}

	function handleCloseVersionHistory() {
		showVersionHistory = false;
	}

	async function handleRestoreVersion(version: DocumentVersion) {
		if (!documentPath) return;

		try {
			await apiClient.restoreDocumentToVersion(documentPath, version.hash);
			window.location.reload();
		} catch (error) {
			console.error('Failed to restore version:', error);
			throw error;
		}
	}
</script>

<svelte:head>
	<title>{documentTitle}</title>
	<meta name="description" content={document.content?.slice(0, 160) || ''} />
</svelte:head>

<svelte:window onkeydown={handleModeShortcut} />

<PageContainer
	bind:ref={viewRoot}
	width={documentPageWidth()}
	data-testid="document-view"
	data-mode={mode}
>
	<Breadcrumbs path={documentPath} currentDocumentTitle={documentTitle} />

	<header
		class="border-border flex flex-col gap-6 border-b pb-6 md:flex-row md:items-start md:justify-between"
	>
		<div class="flex-1">
			<!-- While editing, the first "# heading" line in the editor is the title. -->
			{#if mode === 'read'}
				<h1
					class="text-foreground mb-4 text-4xl leading-tight font-bold tracking-tight"
					data-testid="document-title"
				>
					{documentTitle}
				</h1>
			{/if}

			<div class="flex flex-wrap items-center gap-4">
				{#if documentCreated}
					<div class="text-muted-foreground flex items-center gap-2 text-sm">
						<Calendar class="h-4 w-4" />
						<span>Created {formatLongDate(documentCreated)}</span>
					</div>
				{/if}

				{#if documentUpdated && documentUpdated !== documentCreated}
					<div class="text-muted-foreground flex items-center gap-2 text-sm">
						<Calendar class="h-4 w-4" />
						<span>Updated {formatLongDate(documentUpdated)}</span>
					</div>
				{/if}

				{#if versionLoader.loading}
					<div class="text-muted-foreground flex items-center gap-2 text-sm">
						<GitBranch class="h-4 w-4" />
						<span>Loading versions...</span>
					</div>
				{:else if versionCount !== undefined && versionCount >= 0}
					<button
						class="text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-2 text-sm transition-colors"
						onclick={handleVersionHistoryClick}
						title="View version history"
						aria-label="View document version history"
					>
						<History class="h-4 w-4" />
						<span>Versions: {versionCount}</span>
					</button>
				{/if}

				{#if documentTags.length > 0}
					<div class="flex items-center gap-2" data-testid="document-tags">
						<Tag class="text-muted-foreground h-4 w-4" />
						<div class="flex flex-wrap gap-2">
							{#each documentTags as tag (tag)}
								<Badge variant="secondary" class="text-xs font-medium" data-testid="document-tag"
									>{tag}</Badge
								>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		</div>

		<div class="flex gap-2">
			<ModeToggle
				{mode}
				onSelect={setMode}
				options={[
					{
						mode: 'read',
						label: 'Read',
						title: 'Read (Ctrl+E)',
						icon: BookOpen,
						testId: 'read-mode-button'
					},
					{
						mode: 'edit',
						label: 'Edit',
						title: 'Edit (Ctrl+E)',
						icon: Pencil,
						testId: 'edit-document-button'
					}
				]}
			/>

			<Button
				variant="outline"
				size="sm"
				onclick={() => (showShareModal = true)}
				title="Share document"
				data-testid="share-document-button"
			>
				<Share class="h-4 w-4" />
				Share
			</Button>

			<!-- Less frequent actions, and Delete away from the everyday buttons. -->
			<DropdownMenu.Root>
				<DropdownMenu.Trigger
					class={buttonVariants({ variant: 'outline', size: 'icon-sm' })}
					aria-label="More actions"
					title="More actions"
					data-testid="document-actions-menu"
				>
					<Ellipsis class="h-4 w-4" />
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end" class="w-48">
					<DropdownMenu.Item
						onSelect={handleVersionHistoryClick}
						data-testid="version-history-menu-item"
					>
						<History />
						Version history
					</DropdownMenu.Item>
					<DropdownMenu.Item
						onSelect={() => apiClient.exportDocument(documentPath)}
						data-testid="download-document-menu-item"
					>
						<Download />
						Download
					</DropdownMenu.Item>
					<DropdownMenu.Separator />
					<DropdownMenu.Item
						variant="destructive"
						onSelect={handleDeleteClick}
						disabled={isDeleting}
						data-testid="delete-document-button"
					>
						<Trash2 />
						Delete
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</div>
	</header>

	<main>
		{#if editorModule}
			<div bind:this={editorContainer} class:hidden={mode !== 'edit'}>
				{#await editorModule then { default: DocumentInlineEditor }}
					<DocumentInlineEditor
						bind:this={inlineEditor}
						{document}
						{onSaved}
						autofocus={focusOnLoad}
					/>
				{/await}
			</div>
		{/if}

		{#if mode === 'edit'}
			<!-- Editing: the editor above takes the rendered content's place. -->
		{:else if document.content}
			<div bind:this={contentContainer} class="reading" data-testid="document-content">
				<MarkdownRenderer content={processedContent} />
			</div>
		{:else}
			<div class="flex flex-col items-center justify-center py-12 text-center">
				<p class="text-muted-foreground mb-6 text-lg">This document has no content yet.</p>
				<Button onclick={() => setMode('edit')}>
					<Edit class="h-4 w-4" />
					Add Content
				</Button>
			</div>
		{/if}
	</main>

	{#if mode === 'read' && ((linksStore.backlinks?.length || 0) > 0 || validOutgoingLinks.length > 0)}
		<section class="border-border rounded-lg border p-6">
			<div class="mb-4 flex items-center justify-between">
				<div class="flex items-center gap-2">
					<Link2 class="text-muted-foreground h-5 w-5" />
					<h2 class="text-lg font-semibold">Links</h2>
					<Badge variant="secondary" class="text-xs">
						{linksStore.backlinksLoading || linksStore.outgoingLinksLoading
							? '...'
							: (linksStore.backlinks?.length || 0) + validOutgoingLinks.length}
					</Badge>
				</div>
				<DocumentGraphToggle
					currentView={graphViewMode}
					onToggle={(view) => (graphViewMode = view)}
					disabled={linksStore.backlinksLoading || linksStore.outgoingLinksLoading}
				/>
			</div>

			{#if linksStore.backlinksLoading || linksStore.outgoingLinksLoading}
				<div class="flex items-center justify-center py-8">
					<div class="text-muted-foreground text-sm">Loading links...</div>
				</div>
			{:else if graphViewMode === 'graph'}
				<div class="h-[400px] w-full">
					<LazyDocumentGraphView
						currentDocument={document}
						backlinks={linksStore.backlinks}
						outgoingLinks={linksStore.outgoingLinks}
					/>
				</div>
			{:else}
				<div class="space-y-4">
					{#if (linksStore.backlinks?.length || 0) > 0}
						<div>
							<h3 class="text-muted-foreground mb-3 text-sm font-medium">
								Backlinks ({linksStore.backlinks.length})
							</h3>
							<div class="space-y-3">
								{#each linksStore.backlinks as backlinkDocument (backlinkDocument.metaData.path)}
									<button
										class="bg-background border-border group hover:bg-muted/50 w-full cursor-pointer rounded-lg border p-4 text-left transition-colors"
										onclick={() => goto(`/documents${backlinkDocument.metaData.path}`)}
										aria-label={`Navigate to document: ${backlinkDocument.metaData.title}`}
									>
										<div class="mb-2 flex items-start justify-between">
											<h4 class="group-hover:text-primary font-medium transition-colors">
												{backlinkDocument.metaData.title}
											</h4>
											<span class="text-muted-foreground text-xs">
												{formatLongDate(backlinkDocument.metaData.updated)}
											</span>
										</div>

										{#if backlinkDocument.metaData.path}
											<p class="text-muted-foreground mb-2 text-sm">
												{backlinkDocument.metaData.path}
											</p>
										{/if}

										{#if backlinkDocument.content}
											<p class="text-muted-foreground line-clamp-2 text-sm">
												{backlinkDocument.content.slice(0, 150)}...
											</p>
										{/if}
									</button>
								{/each}
							</div>
						</div>
					{/if}

					{#if validOutgoingLinks.length > 0}
						<div>
							<h3 class="text-muted-foreground mb-3 text-sm font-medium">
								Outgoing Links ({validOutgoingLinks.length})
							</h3>
							<div class="space-y-3">
								{#each validOutgoingLinks as outgoingLink (outgoingLink.path)}
									<button
										class="bg-background border-border group hover:bg-muted/50 w-full cursor-pointer rounded-lg border p-4 text-left transition-colors"
										onclick={() => goto(`/documents${outgoingLink.path}`)}
										aria-label={`Navigate to document: ${outgoingLink.display_text}`}
									>
										<div class="mb-2 flex items-start justify-between">
											<h4 class="group-hover:text-primary font-medium transition-colors">
												{outgoingLink.display_text}
											</h4>
											<span class="text-muted-foreground text-xs"> Link </span>
										</div>

										<p class="text-muted-foreground text-sm">
											{outgoingLink.path}
										</p>
									</button>
								{/each}
							</div>
						</div>
					{/if}

					{#if (linksStore.backlinks?.length || 0) === 0 && validOutgoingLinks.length === 0}
						<div class="flex flex-col items-center justify-center py-8 text-center">
							<p class="text-muted-foreground text-sm">No links found.</p>
							<p class="text-muted-foreground mt-1 text-xs">
								Create [[wiki links]] to other documents to see connections.
							</p>
						</div>
					{/if}
				</div>
			{/if}
		</section>
	{/if}
</PageContainer>

<DeleteConfirmModal
	open={showDeleteModal}
	{isDeleting}
	onConfirm={handleConfirmDelete}
	onCancel={handleCancelDelete}
/>

<ShareDocumentModal
	open={showShareModal}
	{documentPath}
	{documentTitle}
	onclose={() => (showShareModal = false)}
/>

<ImageLightbox
	src={imageLightbox.src}
	alt={imageLightbox.alt}
	open={imageLightbox.open}
	onClose={imageLightboxActions.close}
/>

<VersionHistoryModal
	open={showVersionHistory}
	path={documentPath}
	{versions}
	onClose={handleCloseVersionHistory}
	onRestore={handleRestoreVersion}
/>
