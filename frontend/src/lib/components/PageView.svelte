<script lang="ts">
	import { Edit, Trash2, Move, Calendar, Tag } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import Breadcrumbs from './Breadcrumbs.svelte';
	import DeleteConfirmModal from './DeleteConfirmModal.svelte';
	import {
		parseMarkdownWithCopyButtons,
		initializeCodeBlockCopyButtons
	} from '$lib/utils/markdown';
	import type { Page } from '$lib/api/types';
	import ImageLightbox from './ImageLightbox.svelte';
	import { imageLightbox, imageLightboxActions } from '$lib/stores/image-lightbox';

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

	$effect(() => {
		if (page.content) {
			parseMarkdownWithCopyButtons(page.content).then((html) => {
				renderedMarkdown = html;
			});
		} else {
			renderedMarkdown = '';
		}
	});

	$effect(() => {
		if (contentContainer && renderedMarkdown) {
			setTimeout(() => {
				if (contentContainer) {
					initializeCodeBlockCopyButtons(contentContainer);
				}
			}, 0);
		}
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
				{#if pageTags.length > 0}
					<div class="flex items-center gap-2 pt-2" data-testid="page-tags">
						<Tag class="text-muted-foreground h-4 w-4" />
						<div class="flex flex-wrap gap-2">
							{#each pageTags as tag (tag)}
								<Badge
									variant="default"
									class="bg-blue-600 text-xs text-white hover:bg-blue-500"
									data-testid="page-tag">{tag}</Badge
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
	<main class="bg-primary ring-border-primary rounded-lg p-8 shadow-sm ring-1">
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
