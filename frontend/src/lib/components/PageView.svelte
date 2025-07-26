<script lang="ts">
	import { Edit, Trash2, Move, Calendar, Tag, Link2, GitBranch, History } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import Breadcrumbs from './Breadcrumbs.svelte';
	import DeleteConfirmModal from './DeleteConfirmModal.svelte';
	import VersionHistoryModal from './VersionHistoryModal.svelte';
	import {
		parseMarkdownWithCopyButtons,
		initializeMarkdownInteractions
	} from '$lib/utils/markdown';
	import type { Page, DocumentVersion } from '$lib/api/types';
	import ImageLightbox from './ImageLightbox.svelte';
	import { imageLightbox, imageLightboxActions } from '$lib/stores/image-lightbox';
	import { apiClient } from '$lib/api/client';
	import { goto } from '$app/navigation';

	interface Props {
		page: Page;
		onEdit?: (slug: string) => void;
		onDelete?: (slug: string) => void | Promise<void>;
		onMove?: (page: Page) => void;
	}

	let { page, onEdit = () => {}, onDelete = () => {}, onMove = () => {} }: Props = $props();

	let showDeleteModal = $state(false);
	let isDeleting = $state(false);

	const pagePath = $derived(page.metaData?.path || `/${page.metaData?.slug}`);
	const pageTitle = $derived(page.metaData?.title || 'Untitled');
	const pageSlug = $derived(page.metaData?.slug || '');
	const pageCreated = $derived(page.metaData?.created);
	const pageUpdated = $derived(page.metaData?.updated);
	const pageTags = $derived(page.metaData?.tags || []);

	// DOM reference for the content container
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

	// Enhanced markdown rendering with copy buttons
	let renderedMarkdown = $state('');

	// Backlinks functionality
	let backlinks = $state<Page[]>([]);
	let backlinkLoading = $state(false);

	// Version count functionality
	let versionCount = $state<number | undefined>(undefined);
	let versionLoading = $state(false);

	// Version history functionality
	let showVersionHistory = $state(false);
	let versions = $state<DocumentVersion[]>([]);

	$effect(() => {
		// Ensure the effect tracks page.content changes
		const content = page.content;

		if (content) {
			parseMarkdownWithCopyButtons(content)
				.then((html) => {
					renderedMarkdown = html;
				})
				.catch((error) => {
					console.error('Failed to parse markdown:', error);
					renderedMarkdown = `<div class="text-red-500 p-4 border border-red-200 rounded">
						<p><strong>Error parsing content:</strong></p>
						<p>${error.message}</p>
						<details class="mt-2">
							<summary class="cursor-pointer">Raw content</summary>
							<pre class="mt-2 p-2 bg-gray-100 rounded overflow-x-auto">${content}</pre>
						</details>
					</div>`;
				});
		} else {
			renderedMarkdown = '';
		}
	});

	$effect(() => {
		if (contentContainer && renderedMarkdown) {
			setTimeout(() => {
				if (contentContainer) {
					initializeMarkdownInteractions(contentContainer);
				}
			}, 0);
		}
	});

	// Load backlinks when page changes
	$effect(() => {
		async function loadBacklinks() {
			if (!pagePath) return;

			backlinkLoading = true;
			try {
				backlinks = await apiClient.getPageBacklinks(pagePath);
			} catch (error) {
				console.error('Failed to load backlinks:', error);
				backlinks = [];
			} finally {
				backlinkLoading = false;
			}
		}

		loadBacklinks();
	});

	// Function to refresh version count
	async function refreshVersionCount() {
		if (!pagePath) return;

		versionLoading = true;
		try {
			const versionsResponse = await apiClient.getPageVersions(pagePath);
			versionCount = versionsResponse.total || 0;
		} catch (error) {
			console.error('Failed to load version count:', error);
			versionCount = undefined;
		} finally {
			versionLoading = false;
		}
	}

	// Load version count when page changes
	$effect(() => {
		// Track pagePath and page updated timestamp
		void pagePath;
		void pageUpdated;

		refreshVersionCount();
	});

	function handleDeleteClick() {
		showDeleteModal = true;
	}

	async function handleConfirmDelete() {
		isDeleting = true;

		try {
			const result = onDelete(pagePath);
			// If onDelete returns a promise, wait for it
			if (result && typeof result.then === 'function') {
				await result;
			}
			showDeleteModal = false;
		} catch (error) {
			console.error('Failed to delete page:', error);
		} finally {
			isDeleting = false;
		}
	}

	function handleCancelDelete() {
		showDeleteModal = false;
		isDeleting = false;
	}

	async function handleVersionHistoryClick() {
		if (!pagePath) return;

		showVersionHistory = true;

		// Load versions if not already loaded
		if (versions.length === 0) {
			try {
				const versionsResponse = await apiClient.getPageVersions(pagePath);
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
		if (!pagePath) return;

		try {
			await apiClient.restoreDocumentToVersion(pagePath, version.hash);
			// Refresh the page to show the restored content
			window.location.reload();
		} catch (error) {
			console.error('Failed to restore version:', error);
			throw error; // Re-throw to let the modal handle the error display
		}
	}
</script>

<svelte:head>
	<title>{pageTitle}</title>
	<meta name="description" content={page.content?.slice(0, 160) || ''} />
</svelte:head>

<div class="mx-auto max-w-7xl space-y-8 p-6">
	<Breadcrumbs path={pagePath} currentPageTitle={pageTitle} />

	<!-- Page Header -->
	<header
		class="border-border flex flex-col gap-6 border-b pb-6 md:flex-row md:items-start md:justify-between"
	>
		<div class="flex-1">
			<h1 class="text-primary mb-4 text-4xl leading-tight font-bold">{pageTitle}</h1>

			<!-- Page Metadata -->
			<div class="flex flex-wrap items-center gap-4">
				{#if pageCreated}
					<div class="text-muted-foreground flex items-center gap-2 text-sm">
						<Calendar class="h-4 w-4" />
						<span>Created {formatDate(pageCreated)}</span>
					</div>
				{/if}

				{#if pageUpdated && pageUpdated !== pageCreated}
					<div class="text-muted-foreground flex items-center gap-2 text-sm">
						<Calendar class="h-4 w-4" />
						<span>Updated {formatDate(pageUpdated)}</span>
					</div>
				{/if}

				{#if versionLoading}
					<div class="text-muted-foreground flex items-center gap-2 text-sm">
						<GitBranch class="h-4 w-4" />
						<span>Loading versions...</span>
					</div>
				{:else if versionCount !== undefined && versionCount >= 0}
					<button
						class="text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-2 text-sm transition-colors"
						onclick={handleVersionHistoryClick}
						title="View version history"
					>
						<History class="h-4 w-4" />
						<span>Versions: {versionCount}</span>
					</button>
				{/if}

				{#if pageTags.length > 0}
					<div class="flex items-center gap-2" data-testid="page-tags">
						<Tag class="text-muted-foreground h-4 w-4" />
						<div class="flex flex-wrap gap-2">
							{#each pageTags as tag (tag)}
								<Badge variant="default" class="text-xs text-white " data-testid="page-tag"
									>{tag}</Badge
								>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		</div>

		<!-- Action Buttons -->
		<div class="flex gap-2">
			<Button
				variant="outline"
				size="sm"
				onclick={() => onEdit(pageSlug)}
				title="Edit page"
				data-testid="edit-page-button"
			>
				<Edit class="h-4 w-4" />
				Edit
			</Button>

			<Button
				variant="outline"
				size="sm"
				onclick={() => onMove(page)}
				title="Move page"
				data-testid="move-page-button"
			>
				<Move class="h-4 w-4" />
				Move
			</Button>

			<Button
				variant="destructive"
				size="sm"
				onclick={handleDeleteClick}
				disabled={isDeleting}
				title="Delete page"
				data-testid="delete-page-button"
			>
				<Trash2 class="h-4 w-4" />
				Delete
			</Button>
		</div>
	</header>

	<!-- Page Content -->
	<main class="bg-secondary ring-border-primary rounded-lg p-8 shadow-sm ring-1">
		{#if page.content}
			<div bind:this={contentContainer} class="prose prose-slate dark:prose-invert max-w-none">
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html renderedMarkdown}
			</div>
		{:else}
			<div class="flex flex-col items-center justify-center py-12 text-center">
				<p class="text-muted-foreground mb-6 text-lg">This page has no content yet.</p>
				<Button onclick={() => onEdit(pageSlug)}>
					<Edit class="h-4 w-4" />
					Add Content
				</Button>
			</div>
		{/if}
	</main>

	<!-- Backlinks Section -->
	{#if backlinks && backlinks.length > 0}
		<section class="bg-secondary ring-border-primary rounded-lg p-6 shadow-sm ring-1">
			<div class="mb-4 flex items-center gap-2">
				<Link2 class="text-muted-foreground h-5 w-5" />
				<h2 class="text-lg font-semibold">Backlinks</h2>
				<Badge variant="secondary" class="text-xs">
					{backlinkLoading ? '...' : backlinks?.length || 0}
				</Badge>
			</div>

			{#if backlinkLoading}
				<div class="flex items-center justify-center py-8">
					<div class="text-muted-foreground text-sm">Loading backlinks...</div>
				</div>
			{:else if backlinks.length > 0}
				<div class="space-y-3">
					{#each backlinks as backlinkPage (backlinkPage.metaData.path)}
						<div
							class="bg-background border-border group hover:bg-muted/50 cursor-pointer rounded-lg border p-4 transition-colors"
						>
							<button
								class="w-full text-left"
								onclick={() => goto(`/pages${backlinkPage.metaData.path}`)}
							>
								<div class="mb-2 flex items-start justify-between">
									<h3 class="group-hover:text-primary font-medium transition-colors">
										{backlinkPage.metaData.title}
									</h3>
									<span class="text-muted-foreground text-xs">
										{formatDate(backlinkPage.metaData.updated)}
									</span>
								</div>

								{#if backlinkPage.metaData.path}
									<p class="text-muted-foreground mb-2 text-sm">
										{backlinkPage.metaData.path}
									</p>
								{/if}

								{#if backlinkPage.content}
									<p class="text-muted-foreground line-clamp-2 text-sm">
										{backlinkPage.content.slice(0, 150)}...
									</p>
								{/if}
							</button>
						</div>
					{/each}
				</div>
			{:else}
				<div class="flex flex-col items-center justify-center py-8 text-center">
					<p class="text-muted-foreground text-sm">No pages link to this page yet.</p>
				</div>
			{/if}
		</section>
	{/if}
</div>

<!-- Delete Confirmation Modal -->
<DeleteConfirmModal
	open={showDeleteModal}
	{isDeleting}
	onConfirm={handleConfirmDelete}
	onCancel={handleCancelDelete}
/>

<!-- Image Lightbox Modal -->
<ImageLightbox
	src={$imageLightbox.src}
	alt={$imageLightbox.alt}
	open={$imageLightbox.open}
	onClose={imageLightboxActions.close}
/>

<!-- Version History Modal -->
<VersionHistoryModal
	open={showVersionHistory}
	path={pagePath}
	{versions}
	onClose={handleCloseVersionHistory}
	onRestore={handleRestoreVersion}
/>
