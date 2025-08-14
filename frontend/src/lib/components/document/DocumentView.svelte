<script lang="ts">
	import { Edit, Trash2, Calendar, Tag, Link2, GitBranch, History, Share } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import Breadcrumbs from '../Breadcrumbs.svelte';
	import DeleteConfirmModal from '../modal/DeleteConfirmModal.svelte';
	import VersionHistoryModal from '../VersionHistoryModal.svelte';
	import ShareDocumentModal from '../modal/ShareDocumentModal.svelte';
	import { initializeMarkdownInteractions } from '$lib/utils/markdown-blocks';
	import MarkdownRenderer from '$lib/components/markdown/MarkdownRenderer.svelte';
	import type { Document, DocumentVersion, WikiLink } from '$lib/api/types';
	import ImageLightbox from '../ImageLightbox.svelte';
	import { imageLightbox, imageLightboxActions } from '$lib/stores/image-lightbox';
	import { apiClient } from '$lib/api/client';
	import { goto } from '$app/navigation';
	import { useOptimizedLoading } from '$lib/composables/useOptimizedLoading.svelte.js';
	import {
		secretStore,
		secretsUnlocked,
		replaceSecretPlaceholders,
		parseSecretPlaceholders
	} from '$lib/stores/secrets';
	import { processHashtags } from '$lib/utils/hashtag-renderer.js';
	import DocumentGraphView from './DocumentGraphView.svelte';
	import DocumentGraphToggle from './DocumentGraphToggle.svelte';
	import { 
		documentActions, 
		backlinks, 
		outgoingLinks, 
		isBacklinksLoading, 
		isOutgoingLinksLoading 
	} from '$lib/stores/documents';

	interface Props {
		document: Document;
		onEdit?: (slug: string) => void;
		onDelete?: (slug: string) => void | Promise<void>;
	}

	let { document, onEdit = () => {}, onDelete = () => {} }: Props = $props();

	let showDeleteModal = $state(false);
	let isDeleting = $state(false);
	let showShareModal = $state(false);

	const documentPath = $derived(document.metaData?.path || `/${document.metaData?.slug}`);
	const documentTitle = $derived(document.metaData?.title || 'Untitled');
	const documentSlug = $derived(document.metaData?.slug || '');
	const documentCreated = $derived(document.metaData?.created);
	const documentUpdated = $derived(document.metaData?.updated);
	const documentTags = $derived(document.metaData?.tags || []);

	let contentContainer = $state<HTMLDivElement>();

	function formatDate(dateString?: string): string {
		if (!dateString) return '';
		const date = new Date(dateString);
		return date.toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
	}

	let processedContent = $state('');

	let graphViewMode = $state<'list' | 'graph'>('graph');
	const backlinkLoader = useOptimizedLoading(200, 150);

	let versionCount = $state<number | undefined>(undefined);
	const versionLoader = useOptimizedLoading(200, 150);

	let showVersionHistory = $state(false);
	let versions = $state<DocumentVersion[]>([]);

	function addSecretPlaceholderIndicators(text: string): string {
		const placeholders = parseSecretPlaceholders(text);

		let processedText = text;
		for (const { placeholder, key } of placeholders) {
			const indicator = `<span class="secret-placeholder bg-muted text-muted-foreground px-2 py-1 rounded-md font-mono text-sm border border-border" title="Secret '${key}' is locked. Unlock secrets to view the value.">${placeholder} 🔒</span>`;
			processedText = processedText.replace(placeholder, indicator);
		}

		processedText = processHashtags(processedText);
		return processedText;
	}

	$effect(() => {
		async function processContent() {
			const content = document.content;

			if (!content) {
				processedContent = '';
				return;
			}

			try {
				if ($secretsUnlocked) {
					let processedText = await replaceSecretPlaceholders(content, async (key: string) => {
						return await secretStore.getSecret(key);
					});
					processedContent = processHashtags(processedText);
				} else {
					processedContent = addSecretPlaceholderIndicators(content);
				}
			} catch (error) {
				console.error('Failed to process document content:', error);
				processedContent = content;
			}
		}

		processContent();
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
			versionCount = undefined;
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

		if (versions.length === 0) {
			try {
				const versionsResponse = await apiClient.getDocumentVersions(documentPath);
				versions = versionsResponse.versions || [];
			} catch (error) {
				console.error('Failed to load versions:', error);
				versions = [];
			}
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

<div class="mx-auto max-w-7xl space-y-8 p-6" data-testid="document-view">
	<Breadcrumbs path={documentPath} currentDocumentTitle={documentTitle} />

	<header
		class="border-border flex flex-col gap-6 border-b pb-6 md:flex-row md:items-start md:justify-between"
	>
		<div class="flex-1">
			<h1 class="text-primary mb-4 text-4xl leading-tight font-bold" data-testid="document-title">
				{documentTitle}
			</h1>

			<div class="flex flex-wrap items-center gap-4">
				{#if documentCreated}
					<div class="text-muted-foreground flex items-center gap-2 text-sm">
						<Calendar class="h-4 w-4" />
						<span>Created {formatDate(documentCreated)}</span>
					</div>
				{/if}

				{#if documentUpdated && documentUpdated !== documentCreated}
					<div class="text-muted-foreground flex items-center gap-2 text-sm">
						<Calendar class="h-4 w-4" />
						<span>Updated {formatDate(documentUpdated)}</span>
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
								<Badge variant="default" class="text-xs text-white " data-testid="document-tag"
									>{tag}</Badge
								>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		</div>

		<div class="flex gap-2">
			<Button
				variant="outline"
				size="sm"
				onclick={() => onEdit(documentSlug)}
				title="Edit document"
				data-testid="edit-document-button"
			>
				<Edit class="h-4 w-4" />
				Edit
			</Button>

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

			<Button
				variant="destructive"
				size="sm"
				onclick={handleDeleteClick}
				disabled={isDeleting}
				title="Delete document"
				data-testid="delete-document-button"
			>
				<Trash2 class="h-4 w-4" />
				Delete
			</Button>
		</div>
	</header>

	<main class="bg-content ring-border-primary rounded-lg p-8 shadow-sm ring-1">
		{#if document.content}
			<div bind:this={contentContainer} class="max-w-none" data-testid="document-content">
				<MarkdownRenderer content={processedContent} />
			</div>
		{:else}
			<div class="flex flex-col items-center justify-center py-12 text-center">
				<p class="text-muted-foreground mb-6 text-lg">This document has no content yet.</p>
				<Button onclick={() => onEdit(documentSlug)}>
					<Edit class="h-4 w-4" />
					Add Content
				</Button>
			</div>
		{/if}
	</main>

	{#if ($backlinks?.length || 0) > 0 || $outgoingLinks?.some((l) => l.is_valid) || false}
		<section class="bg-content ring-border-primary rounded-lg p-6 shadow-sm ring-1">
			<div class="mb-4 flex items-center justify-between">
				<div class="flex items-center gap-2">
					<Link2 class="text-muted-foreground h-5 w-5" />
					<h2 class="text-lg font-semibold">Links</h2>
					<Badge variant="secondary" class="text-xs">
						{$isBacklinksLoading || $isOutgoingLinksLoading
							? '...'
							: ($backlinks?.length || 0) + ($outgoingLinks?.filter((l) => l.is_valid).length || 0)}
					</Badge>
				</div>
				<DocumentGraphToggle
					currentView={graphViewMode}
					onToggle={(view) => (graphViewMode = view)}
					disabled={$isBacklinksLoading || $isOutgoingLinksLoading}
				/>
			</div>

			{#if $isBacklinksLoading || $isOutgoingLinksLoading}
				<div class="flex items-center justify-center py-8">
					<div class="text-muted-foreground text-sm">Loading links...</div>
				</div>
			{:else if graphViewMode === 'graph'}
				<div class="h-[400px] w-full">
					<DocumentGraphView currentDocument={document} backlinks={$backlinks} outgoingLinks={$outgoingLinks} />
				</div>
			{:else}
				<div class="space-y-4">
					{#if ($backlinks?.length || 0) > 0}
						<div>
							<h3 class="text-muted-foreground mb-3 text-sm font-medium">
								Backlinks ({$backlinks.length})
							</h3>
							<div class="space-y-3">
								{#each $backlinks as backlinkDocument (backlinkDocument.metaData.path)}
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
												{formatDate(backlinkDocument.metaData.updated)}
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

					{#if ($outgoingLinks?.filter((l) => l.is_valid).length || 0) > 0}
						<div>
							<h3 class="text-muted-foreground mb-3 text-sm font-medium">
								Outgoing Links ({$outgoingLinks.filter((l) => l.is_valid).length})
							</h3>
							<div class="space-y-3">
								{#each $outgoingLinks.filter((l) => l.is_valid) as outgoingLink (outgoingLink.path)}
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

					{#if ($backlinks?.length || 0) === 0 && ($outgoingLinks?.filter((l) => l.is_valid).length || 0) === 0}
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
</div>

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
	src={$imageLightbox.src}
	alt={$imageLightbox.alt}
	open={$imageLightbox.open}
	onClose={imageLightboxActions.close}
/>

<VersionHistoryModal
	open={showVersionHistory}
	path={documentPath}
	{versions}
	onClose={handleCloseVersionHistory}
	onRestore={handleRestoreVersion}
/>
