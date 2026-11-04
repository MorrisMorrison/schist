<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		CheckSquare,
		Ellipsis,
		FileText,
		Folder as FolderIcon,
		FolderPlus,
		Pencil,
		Pin,
		PinOff,
		Plus,
		TextCursorInput,
		Trash2
	} from '@lucide/svelte';
	import { PageContainer } from '#lib/components/ui/page-container/index.ts';
	import { Button, buttonVariants } from '#lib/components/ui/button/index.ts';
	import { Label } from '#lib/components/ui/label/index.ts';
	import * as Select from '#lib/components/ui/select/index.ts';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.ts';
	import { ToggleSlider } from '#lib/components/ui/toggle-slider/index.ts';
	import Checkbox from '#lib/components/ui/checkbox/checkbox.svelte';
	import LoadingSpinner from '#lib/components/LoadingSpinner.svelte';
	import TagBadge from '#lib/components/TagBadge.svelte';
	import Breadcrumbs from '../Breadcrumbs.svelte';
	import CreateFolderModal from '../modal/CreateFolderModal.svelte';
	import RenameDocumentModal from '../modal/RenameDocumentModal.svelte';
	import DeleteConfirmModal from '../modal/DeleteConfirmModal.svelte';
	import {
		documentsStore,
		foldersStore,
		folderActions,
		documentActions
	} from '#lib/stores/documents.svelte.ts';
	import { compareNames, isPinned, setPinned } from '#lib/utils/pins.ts';
	import { formatTimeAgo } from '#lib/utils/date.ts';
	import { getParentPath, isDirectChild } from '#lib/utils/path.ts';
	import { cn } from '#lib/utils.ts';
	import type { DocumentSummary, Folder } from '#lib/api/types.ts';

	interface Props {
		/** The folder's path ('' for the root). */
		path?: string;
		showCreateButtons?: boolean;
	}

	let { path = '', showCreateButtons = true }: Props = $props();

	// How many tags a row shows; the rest is "+n".
	const ROW_TAGS = 2;

	type SortKey = 'name' | 'modified' | 'created';
	const sortItems: { value: SortKey; label: string }[] = [
		{ value: 'name', label: 'Name' },
		{ value: 'modified', label: 'Last changed' },
		{ value: 'created', label: 'Created' }
	];
	let sortBy = $state<SortKey>('name');
	// Name reads A→Z; dates read newest first.
	let descending = $state(false);
	let includeSubfolders = $state(false);

	let isLoading = $state(false);
	let selecting = $state(false);
	let selected = $state<Set<string>>(new Set());
	let pinning = $state<string | null>(null);

	let showCreateFolderModal = $state(false);
	let pageToRename = $state<DocumentSummary | null>(null);
	let pageToDelete = $state<DocumentSummary | null>(null);
	let confirmBulkDelete = $state(false);
	let deleting = $state(false);

	const isRoot = $derived(path === '' || path === '/');
	const folderPrefix = $derived(isRoot ? '/' : `${path}/`);

	const title = $derived.by(() => {
		if (isRoot) return 'All pages';
		const name = path.split('/').pop() ?? '';
		return name ? name.charAt(0).toUpperCase() + name.slice(1).replace(/-/g, ' ') : 'Folder';
	});

	function findFolder(folders: readonly Folder[], target: string): Folder | undefined {
		for (const folder of folders) {
			if (folder.path === target) return folder;
			const inside = findFolder(folder.sub_folders ?? [], target);
			if (inside) return inside;
		}
		return undefined;
	}

	// Subfolders of this folder (the tree's top level for the root). Hidden in
	// the flat view, which lists their pages instead.
	const subfolders = $derived.by((): Folder[] => {
		if (includeSubfolders) return [];
		const tree = foldersStore.folders ?? [];
		const list = isRoot ? tree : (findFolder(tree, path)?.sub_folders ?? []);
		return [...list].sort((a, b) => compareNames(a.name, b.name));
	});

	const pages = $derived.by((): DocumentSummary[] => {
		const inFolder = (documentsStore.documents ?? []).filter((document) => {
			const pagePath = document.metaData?.path ?? '';
			return includeSubfolders ? pagePath.startsWith(folderPrefix) : isDirectChild(pagePath, path);
		});
		const time = (value?: string) => new Date(value ?? 0).getTime() || 0;
		return inFolder.sort((a, b) => {
			const ma = a.metaData;
			const mb = b.metaData;
			let order = 0;
			if (sortBy === 'name') order = compareNames(ma.title ?? '', mb.title ?? '');
			else if (sortBy === 'created') order = time(ma.created) - time(mb.created);
			else order = time(ma.updated ?? ma.created) - time(mb.updated ?? mb.created);
			return descending ? -order : order;
		});
	});

	const counts = $derived.by(() => {
		const pageCount = `${pages.length} ${pages.length === 1 ? 'page' : 'pages'}`;
		if (subfolders.length === 0) return pageCount;
		return `${pageCount} · ${subfolders.length} ${subfolders.length === 1 ? 'folder' : 'folders'}`;
	});

	/** In the flat view, where a page sits below this folder ("projects/deep"). */
	function subPath(document: DocumentSummary): string {
		const parent = getParentPath(document.metaData.path);
		const withSlash = parent.endsWith('/') ? parent : `${parent}/`;
		return withSlash.startsWith(folderPrefix)
			? withSlash.slice(folderPrefix.length).replace(/\/$/, '')
			: '';
	}

	function changeSort(value: SortKey) {
		sortBy = value;
		descending = value !== 'name';
	}

	$effect(() => {
		void path;
		loadFolderData();
	});

	async function loadFolderData() {
		isLoading = true;
		try {
			await Promise.all([folderActions.loadFolderTree(), documentActions.loadDocuments()]);
		} catch (error) {
			console.error('Failed to load folder data:', error);
		} finally {
			isLoading = false;
		}
	}

	async function togglePin(document: DocumentSummary) {
		const pagePath = document.metaData.path;
		pinning = pagePath;
		try {
			await setPinned(pagePath, !isPinned(document));
			await documentActions.loadDocuments(true);
		} catch (error) {
			console.error('Failed to change the pin:', error);
		} finally {
			pinning = null;
		}
	}

	function toggleSelected(pagePath: string, on: boolean) {
		const next = new Set(selected);
		if (on) next.add(pagePath);
		else next.delete(pagePath);
		selected = next;
	}

	function stopSelecting() {
		selecting = false;
		selected = new Set();
	}

	async function deletePage() {
		if (!pageToDelete) return;
		deleting = true;
		try {
			await documentActions.deleteDocumentByPath(pageToDelete.metaData.path);
			pageToDelete = null;
		} catch (error) {
			console.error('Failed to delete the page:', error);
		} finally {
			deleting = false;
		}
	}

	async function deleteSelected() {
		deleting = true;
		try {
			for (const pagePath of selected) {
				await documentActions.deleteDocumentByPath(pagePath);
			}
			confirmBulkDelete = false;
			stopSelecting();
		} catch (error) {
			console.error('Failed to delete the selected pages:', error);
		} finally {
			deleting = false;
		}
	}

	async function handleFolderCreated() {
		showCreateFolderModal = false;
		await loadFolderData();
	}

	async function handleRenamed() {
		pageToRename = null;
		await documentActions.loadDocuments(true);
	}
</script>

<PageContainer width="wide">
	<Breadcrumbs {path} />

	<!-- Title and toolbar sit side by side only when there's room for both
	     (lg); below that the toolbar goes under the title instead of squeezing it. -->
	<div
		class="border-border flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between"
	>
		<div class="shrink-0 space-y-1">
			<h1 class="text-3xl font-bold">{title}</h1>
			<p class="text-muted-foreground flex items-center gap-2 text-sm" data-testid="folder-counts">
				{counts}
				{#if isLoading}<LoadingSpinner size="sm" />{/if}
			</p>
		</div>

		<div class="flex flex-wrap items-center gap-2 lg:justify-end">
			<div class="flex items-center gap-1">
				<Select.Root
					type="single"
					items={sortItems}
					bind:value={() => sortBy, (value) => changeSort(value as SortKey)}
				>
					<Select.Trigger size="sm" class="min-w-32" aria-label="Sort by">
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
					onclick={() => (descending = !descending)}
					aria-label={descending ? 'Sort ascending' : 'Sort descending'}
					title={descending ? 'Sort ascending' : 'Sort descending'}
				>
					{descending ? '↓' : '↑'}
				</Button>
			</div>

			<div class="flex items-center gap-2 px-1">
				<ToggleSlider
					id="folder-include-subfolders"
					aria-label="Include subfolders"
					checked={includeSubfolders}
					onCheckedChange={(on) => (includeSubfolders = on)}
				/>
				<Label for="folder-include-subfolders" class="text-sm font-normal">Include subfolders</Label
				>
			</div>

			<Button
				variant={selecting ? 'secondary' : 'outline'}
				size="sm"
				onclick={() => (selecting ? stopSelecting() : (selecting = true))}
				disabled={pages.length === 0}
			>
				<CheckSquare class="size-4" />
				Select
			</Button>

			{#if showCreateButtons}
				<Button
					variant="outline"
					size="sm"
					onclick={() => (showCreateFolderModal = true)}
					data-testid="create-folder-header"
				>
					<FolderPlus class="size-4" />
					New folder
				</Button>
				<Button size="sm" onclick={() => goto(`/new${path}`)} data-testid="create-document">
					<Plus class="size-4" />
					New page
				</Button>
			{/if}
		</div>
	</div>

	{#if selecting}
		<div
			class="border-primary/40 bg-primary/5 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
			data-testid="folder-selection-bar"
		>
			<span>{selected.size} selected</span>
			<div class="flex gap-2">
				<Button
					variant="ghost"
					size="sm"
					onclick={() => (selected = new Set(pages.map((d) => d.metaData.path)))}
				>
					Select all
				</Button>
				<Button
					variant="destructive"
					size="sm"
					disabled={selected.size === 0}
					onclick={() => (confirmBulkDelete = true)}
				>
					<Trash2 class="size-4" />
					Delete ({selected.size})
				</Button>
				<Button variant="outline" size="sm" onclick={stopSelecting}>Done</Button>
			</div>
		</div>
	{/if}

	{#if subfolders.length > 0 || pages.length > 0}
		<ul class="mt-4" data-testid="documents-section">
			{#each subfolders as folder (folder.path)}
				<li
					data-testid="folder-subfolder-row"
					class="border-border hover:bg-accent/50 flex items-center gap-3 border-b px-1 py-2"
				>
					<FolderIcon class="text-primary size-4 shrink-0" />
					<a
						href={`/folders${folder.path}`}
						class="text-foreground min-w-0 flex-1 truncate text-sm no-underline hover:underline"
						><span data-row-title>{folder.name}</span></a
					>
					<span class="text-muted-foreground shrink-0 text-xs">
						{folder.document_count}
						{folder.document_count === 1 ? 'page' : 'pages'}
					</span>
				</li>
			{/each}

			{#each pages as document (document.metaData.path)}
				{@const pagePath = document.metaData.path}
				{@const pinned = isPinned(document)}
				{@const tags = document.metaData.tags ?? []}
				<li
					data-testid="folder-page-row"
					class={cn(
						'border-border hover:bg-accent/50 flex items-center gap-3 border-b px-1 py-2',
						selected.has(pagePath) && 'bg-[var(--nav-active)]'
					)}
				>
					{#if selecting}
						<Checkbox
							aria-label={`Select ${document.metaData.title}`}
							checked={selected.has(pagePath)}
							onCheckedChange={(on) => toggleSelected(pagePath, on)}
						/>
					{/if}
					<FileText class="text-muted-foreground size-4 shrink-0" />
					<a
						href={`/documents${pagePath}`}
						class="text-foreground min-w-0 flex-1 truncate text-sm no-underline hover:underline"
					>
						<span data-row-title>{document.metaData.title}</span>
						{#if includeSubfolders && subPath(document)}
							<span class="text-muted-foreground ml-2 text-xs">{subPath(document)}</span>
						{/if}
					</a>
					<span class="hidden shrink-0 items-center gap-1 sm:flex">
						{#each tags.slice(0, ROW_TAGS) as tag (tag)}
							<TagBadge {tag} data-testid="folder-row-tag" />
						{/each}
						{#if tags.length > ROW_TAGS}
							<span class="text-muted-foreground text-xs">+{tags.length - ROW_TAGS}</span>
						{/if}
					</span>
					<time
						class="text-muted-foreground w-20 shrink-0 text-right text-xs"
						datetime={document.metaData.updated}>{formatTimeAgo(document.metaData.updated)}</time
					>
					<Button
						variant="ghost"
						size="icon"
						class="size-7 shrink-0 {pinned ? 'text-primary' : 'text-muted-foreground'}"
						aria-label={`${pinned ? 'Unpin' : 'Pin'} ${document.metaData.title}`}
						title={pinned ? 'Unpin' : 'Pin to Home'}
						disabled={pinning === pagePath}
						onclick={() => togglePin(document)}
					>
						{#if pinned}<PinOff class="size-4" />{:else}<Pin class="size-4" />{/if}
					</Button>
					<DropdownMenu.Root>
						<DropdownMenu.Trigger
							class={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'size-7 shrink-0')}
							aria-label={`More actions for ${document.metaData.title}`}
						>
							<Ellipsis class="size-4" />
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end" class="w-40">
							<DropdownMenu.Item onSelect={() => goto(`/documents${pagePath}?mode=edit`)}>
								<Pencil />
								Edit
							</DropdownMenu.Item>
							<DropdownMenu.Item onSelect={() => (pageToRename = document)}>
								<TextCursorInput />
								Rename
							</DropdownMenu.Item>
							<DropdownMenu.Separator />
							<DropdownMenu.Item variant="destructive" onSelect={() => (pageToDelete = document)}>
								<Trash2 />
								Delete
							</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				</li>
			{/each}
		</ul>
	{:else if !isLoading}
		<div
			class="flex flex-col items-center justify-center py-16 text-center"
			data-testid="empty-folder-message"
		>
			<FileText class="text-muted-foreground mb-4 size-10" />
			<h2 class="mb-2 text-lg font-medium">{isRoot ? 'No pages yet' : 'This folder is empty'}</h2>
			<p class="text-muted-foreground mb-6 max-w-md text-sm">
				Create a page or a folder here to get started.
			</p>
			{#if showCreateButtons}
				<div class="flex gap-2">
					<Button onclick={() => goto(`/new${path}`)}>
						<Plus class="size-4" />
						New page
					</Button>
					<Button
						variant="outline"
						onclick={() => (showCreateFolderModal = true)}
						data-testid="create-folder-empty"
					>
						<FolderPlus class="size-4" />
						New folder
					</Button>
				</div>
			{/if}
		</div>
	{/if}
</PageContainer>

<CreateFolderModal
	open={showCreateFolderModal}
	parentPath={path}
	onClose={() => (showCreateFolderModal = false)}
	onCreated={handleFolderCreated}
/>

<RenameDocumentModal
	open={pageToRename !== null}
	document={pageToRename ?? undefined}
	onClose={() => (pageToRename = null)}
	onRenamed={handleRenamed}
/>

<DeleteConfirmModal
	open={pageToDelete !== null}
	title="Delete page"
	description={`Move "${pageToDelete?.metaData.title ?? 'this page'}" to the trash?`}
	isDeleting={deleting}
	onCancel={() => (pageToDelete = null)}
	onConfirm={deletePage}
/>

<DeleteConfirmModal
	open={confirmBulkDelete}
	title={`Delete ${selected.size} ${selected.size === 1 ? 'page' : 'pages'}`}
	description="Move the selected pages to the trash?"
	isDeleting={deleting}
	onCancel={() => (confirmBulkDelete = false)}
	onConfirm={deleteSelected}
/>
