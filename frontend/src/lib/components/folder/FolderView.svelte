<script lang="ts">
	import { PageContainer } from '#lib/components/ui/page-container/index.ts';
	import { goto } from '$app/navigation';
	import { documentsStore, folderActions, documentActions } from '#lib/stores/documents.svelte.ts';
	import DocumentGrid from '../document/DocumentGrid.svelte';
	import Breadcrumbs from '../Breadcrumbs.svelte';
	import CreateFolderModal from '../modal/CreateFolderModal.svelte';
	import { Plus, FolderPlus, File } from '@lucide/svelte';
	import { Button } from '#lib/components/ui/button/index.ts';
	import { Label } from '#lib/components/ui/label/index.ts';
	import * as Select from '#lib/components/ui/select/index.ts';
	import { ToggleSlider } from '#lib/components/ui/toggle-slider/index.ts';
	import { Card, CardContent } from '#lib/components/ui/card/index.ts';
	import LoadingSpinner from '#lib/components/LoadingSpinner.svelte';
	import type { Document, Folder as FolderType } from '#lib/api/types.ts';
	import { isDirectChild } from '#lib/utils/path.ts';

	interface Props {
		path?: string;
		mode?: 'folder' | 'recent' | 'all';
		recentLimit?: number;
		showCreateButtons?: boolean;
		initialDocuments?: Document[];
		initialFolders?: FolderType[];
	}

	let {
		path = '',
		mode = 'folder',
		recentLimit = 10,
		showCreateButtons = true,
		initialDocuments = [],
		initialFolders = []
	}: Props = $props();

	let showCreateFolderModal = $state(false);
	let isLoadingFolderData = $state(false);
	let multiSelectMode = $state(false);
	type SortKey = 'name' | 'created' | 'modified';
	const sortItems: { value: SortKey; label: string }[] = [
		{ value: 'name', label: 'Name' },
		{ value: 'created', label: 'Created' },
		{ value: 'modified', label: 'Modified' }
	];
	let sortBy = $state<SortKey>(mode === 'recent' ? 'modified' : 'name');
	let sortOrder = $state<'asc' | 'desc'>(mode === 'recent' ? 'desc' : 'asc');

	const currentFolderDocuments = $derived.by(() => {
		let filteredDocuments;

		if (mode === 'recent') {
			filteredDocuments = (documentsStore.documents || []).slice(0, recentLimit);
		} else if (mode === 'all') {
			// Copy: the sort below is in place and must not mutate store state.
			filteredDocuments = [...(documentsStore.documents || [])];
		} else {
			filteredDocuments = (documentsStore.documents || []).filter((document) =>
				isDirectChild(document.metaData?.path || '', path)
			);
		}

		return filteredDocuments.sort((a, b) => {
			const metaA = a.metaData || {};
			const metaB = b.metaData || {};
			let comparison = 0;

			if (sortBy === 'name') {
				comparison = (metaA.title || '').localeCompare(metaB.title || '');
			} else if (sortBy === 'created') {
				const dateA = new Date(metaA.created || '').getTime();
				const dateB = new Date(metaB.created || '').getTime();
				comparison = dateA - dateB;
			} else if (sortBy === 'modified') {
				const dateA = new Date(metaA.updated || metaA.created || '').getTime();
				const dateB = new Date(metaB.updated || metaB.created || '').getTime();
				comparison = dateA - dateB;
			}

			return sortOrder === 'desc' ? -comparison : comparison;
		});
	});

	$effect(() => {
		// Note: initialDocuments and initialFolders are handled server-side
		// The new store API is reactive and will update components automatically
		if (initialDocuments?.length === 0 || initialFolders?.length === 0) {
			loadFolderData();
		}
	});

	async function loadFolderData() {
		try {
			isLoadingFolderData = true;
			await Promise.all([folderActions.loadFolderTree(), documentActions.loadDocuments()]);
		} catch (error) {
			console.error('Failed to load folder data:', error);
		} finally {
			isLoadingFolderData = false;
		}
	}

	function navigateToNewDocument(path: string) {
		goto(`/new${path}`);
	}

	async function handleFolderCreated() {
		showCreateFolderModal = false;
		await loadFolderData();
	}
</script>

<PageContainer width="wide">
	{#if mode === 'folder'}
		<Breadcrumbs {path} />
	{/if}

	<div
		class="border-border flex w-full flex-col items-start gap-6 border-b pb-8 md:flex-row md:items-start md:justify-between md:gap-8"
	>
		<div class="space-y-2">
			<h1 class="text-primary text-3xl font-bold">
				{#if mode === 'recent'}
					Recent Documents
				{:else if mode === 'all'}
					All Documents
				{:else if path === ''}
					root
				{:else}
					{(() => {
						const folderName = path.split('/').pop();
						if (!folderName) return 'Folder';
						return folderName.charAt(0).toUpperCase() + folderName.slice(1).replace(/-/g, ' ');
					})()}
				{/if}
			</h1>

			<div class="text-secondary flex items-center gap-2 text-sm">
				{#if mode === 'recent'}
					<span class="font-medium">
						{currentFolderDocuments.length > 0
							? `Showing ${currentFolderDocuments.length} of ${documentsStore.documents.length} documents, sorted by most recent activity`
							: 'No documents found'}
					</span>
				{:else if mode === 'all'}
					<span class="font-medium">
						{currentFolderDocuments.length}
						{currentFolderDocuments.length === 1 ? 'document' : 'documents'} total
					</span>
				{:else}
					<span class="font-medium">
						{currentFolderDocuments.length}
						{currentFolderDocuments.length === 1 ? 'document' : 'documents'}
					</span>
				{/if}
			</div>

			{#if isLoadingFolderData}
				<div class="text-secondary flex items-center gap-2 text-sm">
					<LoadingSpinner size="sm" />
					<span>Loading...</span>
				</div>
			{/if}
		</div>

		<div
			class="flex w-full flex-col items-start gap-2 md:w-auto md:flex-row md:items-center md:gap-4"
		>
			<div
				class="bg-secondary flex flex-wrap items-center gap-1 rounded-lg border p-2 md:flex-nowrap md:gap-2"
			>
				<Label for="sort-select" class="text-secondary">Sort by:</Label>
				<Select.Root
					type="single"
					items={sortItems}
					bind:value={() => sortBy, (value) => (sortBy = value as SortKey)}
				>
					<Select.Trigger id="sort-select" size="sm" class="min-w-28">
						<Select.Value />
					</Select.Trigger>
					<Select.Content>
						{#each sortItems as item (item.value)}
							<Select.Item {...item} />
						{/each}
					</Select.Content>
				</Select.Root>
				<Button
					variant="outline"
					size="sm"
					onclick={() => (sortOrder = sortOrder === 'asc' ? 'desc' : 'asc')}
					title={sortOrder === 'asc' ? 'Sort descending' : 'Sort ascending'}
				>
					{sortOrder === 'asc' ? '↑' : '↓'}
				</Button>
			</div>

			{#if showCreateButtons}
				<div class="flex w-full justify-start gap-2 md:w-auto">
					<Button
						variant="outline"
						onclick={() => (showCreateFolderModal = true)}
						data-testid="create-folder-header"
					>
						<FolderPlus class="h-4 w-4" />
						New Folder
					</Button>
					<Button
						variant="default"
						onclick={() => navigateToNewDocument(path)}
						data-testid="create-document"
					>
						<Plus class="h-4 w-4" />
						New Document
					</Button>
				</div>
			{/if}
		</div>
	</div>

	<Card class="border-border bg-card shadow-sm">
		<CardContent class="pt-4 pr-8 pb-6 pl-8">
			{#if currentFolderDocuments.length > 0}
				<section class="space-y-6" data-testid="documents-section">
					<div class="flex items-center justify-between">
						<h2 class="text-foreground text-xl font-semibold">Documents</h2>
						<div class="flex items-center gap-2">
							<span class="text-muted-foreground text-sm">Multi-select</span>
							<ToggleSlider
								checked={multiSelectMode}
								onCheckedChange={(enabled: boolean) => (multiSelectMode = enabled)}
								size="sm"
							/>
						</div>
					</div>
					<DocumentGrid
						documents={currentFolderDocuments}
						showPath={mode !== 'folder'}
						{multiSelectMode}
						onMultiSelectModeChange={(enabled: boolean) => (multiSelectMode = enabled)}
						emptyMessage={mode === 'recent'
							? 'No recent activity yet. Create your first document to get started!'
							: mode === 'all'
								? 'No documents found. Create your first document to get started!'
								: 'This folder is empty. Create your first document to get started.'}
					/>
				</section>
			{/if}

			{#if currentFolderDocuments.length === 0}
				<div
					class="flex flex-col items-center justify-center py-12 text-center"
					data-testid="empty-folder-message"
				>
					<File class="text-muted mb-4 h-12 w-12" />
					<h3 class="text-primary mb-2 text-lg font-medium">
						{#if mode === 'recent'}
							No recent activity
						{:else if mode === 'all'}
							No documents yet
						{:else if path === ''}
							Welcome to your documentation
						{:else}
							This folder is empty
						{/if}
					</h3>
					<p class="text-muted mb-6 max-w-md">
						{#if mode === 'recent'}
							Create or edit some documents to see recent activity here.
						{:else if mode === 'all'}
							Start building your knowledge base by creating your first document.
						{:else if path === ''}
							Start organizing your knowledge by creating your first document or folder.
						{:else}
							Add some content to this folder to get started.
						{/if}
					</p>
					{#if showCreateButtons}
						<div class="flex w-full justify-start gap-2 md:w-auto">
							<Button onclick={() => navigateToNewDocument(path)}>
								<Plus class="h-4 w-4" />
								Create Document
							</Button>
							<Button
								variant="outline"
								onclick={() => (showCreateFolderModal = true)}
								data-testid="create-folder-empty"
							>
								<FolderPlus class="h-4 w-4" />
								Create Folder
							</Button>
						</div>
					{/if}
				</div>
			{/if}
		</CardContent>
	</Card>
</PageContainer>

<CreateFolderModal
	open={showCreateFolderModal}
	parentPath={path}
	onClose={() => (showCreateFolderModal = false)}
	onCreated={handleFolderCreated}
/>
