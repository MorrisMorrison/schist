<script lang="ts">
	import { onMount } from 'svelte';
	import { foldersStore, folderActions, documentActions } from '$lib/stores/documents';
	import { getParentPath } from '$lib/api/types';
	import { Move, Folder, File, ChevronRight } from 'lucide-svelte';
	import type { Document, Folder as FolderType } from '$lib/api/types';
	import { Button } from '$lib/components/ui/button';
	import {
		Dialog,
		DialogContent,
		DialogHeader,
		DialogTitle,
		DialogFooter
	} from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';

	interface Props {
		document: Document;
		open?: boolean;
		onClose: () => void;
		onMoved: () => void;
	}

	let { document, open = true, onClose, onMoved }: Props = $props();

	let selectedPath = $state('');
	let newDocumentName = $state('');
	let isLoading = $state(false);
	let error = $state('');
	let expandedFolders = $state(new Set<string>());

	const availableFolders = $derived($foldersStore.folders);
	const currentPath = $derived(document.metaData.path || `/${document.metaData.slug}`);
	const currentFolder = $derived(getParentPath(currentPath));
	const documentName = $derived(document.metaData.title || document.metaData.slug || 'Untitled');
	const finalPath = $derived(
		selectedPath
			? `${selectedPath}/${newDocumentName || document.metaData.slug}`
			: `/${newDocumentName || document.metaData.slug}`
	);

	onMount(() => {
		folderActions.loadFolderTree();
		newDocumentName = document.metaData.slug || '';
		selectedPath = currentFolder === '/' ? '' : currentFolder;
	});

	function toggleFolder(folderPath: string) {
		if (expandedFolders.has(folderPath)) {
			expandedFolders.delete(folderPath);
		} else {
			expandedFolders.add(folderPath);
		}
		expandedFolders = new Set(expandedFolders);
	}

	function selectFolder(folderPath: string) {
		selectedPath = folderPath;
	}

	function renderFolderTree(
		folders: FolderType[],
		depth: number = 0
	): Array<{
		folder: FolderType;
		isExpanded: boolean;
		isSelected: boolean;
		isCurrentFolder: boolean;
		hasSubFolders: boolean;
		depth: number;
		children: ReturnType<typeof renderFolderTree>;
	}> {
		return folders.map((folder) => {
			const isExpanded = expandedFolders.has(folder.path);
			const isSelected = selectedPath === folder.path;
			const isCurrentFolder = folder.path === currentFolder;
			const hasSubFolders = folder.sub_folders && folder.sub_folders.length > 0;

			return {
				folder,
				isExpanded,
				isSelected,
				isCurrentFolder,
				hasSubFolders,
				depth,
				children: hasSubFolders && isExpanded ? renderFolderTree(folder.sub_folders, depth + 1) : []
			};
		});
	}

	const folderTree = $derived(renderFolderTree(availableFolders));

	async function moveDocument() {
		if (isLoading) return;

		if (!newDocumentName.trim()) {
			error = 'Document name is required';
			return;
		}

		if (finalPath === currentPath) {
			error = 'Please select a different location or change the document name';
			return;
		}

		isLoading = true;
		error = '';

		try {
			await documentActions.moveDocumentPath(currentPath, finalPath);
			onMoved();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to move document';
		} finally {
			isLoading = false;
		}
	}
</script>

<Dialog {open} onOpenChange={(isOpen) => !isOpen && onClose()}>
	<DialogContent class="max-h-[90vh] max-w-2xl overflow-y-auto">
		<DialogHeader>
			<DialogTitle class="flex items-center gap-3">
				<Move class="h-5 w-5" />
				Move Document
			</DialogTitle>
		</DialogHeader>

		<form
			onsubmit={(e) => {
				e.preventDefault();
				moveDocument();
			}}
			class="space-y-6"
		>
			<!-- Current Location -->
			<div class="bg-muted/50 rounded-lg border p-4">
				<h4 class="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">
					Current Location
				</h4>
				<div class="flex items-center gap-3">
					<File class="text-muted-foreground h-4 w-4" />
					<div>
						<div class="text-foreground font-medium">{documentName}</div>
						<div class="text-muted-foreground font-mono text-sm">{currentPath}</div>
					</div>
				</div>
			</div>

			<!-- New Document Name -->
			<div class="space-y-2">
				<label for="document-name" class="text-foreground text-sm font-medium">
					Document Name (slug)
				</label>
				<Input
					id="document-name"
					type="text"
					bind:value={newDocumentName}
					placeholder="Enter document name"
					required
				/>
			</div>

			<!-- Destination Folder -->
			<fieldset class="space-y-2">
				<legend class="text-foreground text-sm font-medium">Destination Folder</legend>
				<div
					class="bg-background max-h-64 overflow-y-auto rounded-lg border"
					role="radiogroup"
					aria-label="Select destination folder"
				>
					<!-- Root folder option -->
					<div class="border-border border-b last:border-b-0">
						<button
							type="button"
							class="hover:bg-muted/50 flex w-full items-center gap-3 p-3 text-left transition-colors {selectedPath ===
							''
								? 'bg-primary text-primary-foreground'
								: ''}"
							onclick={() => selectFolder('')}
							role="radio"
							aria-checked={selectedPath === ''}
						>
							<Folder class="h-4 w-4" />
							<span>Root (/) - All Documentation</span>
						</button>
					</div>

					<!-- Folder tree -->
					{#each folderTree as item (item.folder.path)}
						<div
							class="border-border border-b last:border-b-0"
							style="margin-left: {item.depth * 1.5}rem;"
						>
							<div class="flex items-center">
								{#if item.hasSubFolders}
									<button
										type="button"
										class="hover:bg-muted/50 p-2 transition-colors"
										onclick={() => toggleFolder(item.folder.path)}
										aria-expanded={item.isExpanded}
										aria-label={`${item.isExpanded ? 'Collapse' : 'Expand'} ${item.folder.name} folder`}
									>
										<ChevronRight
											class="h-4 w-4 transition-transform {item.isExpanded ? 'rotate-90' : ''}"
										/>
									</button>
								{:else}
									<div class="w-8"></div>
								{/if}

								<button
									type="button"
									class="flex flex-1 items-center gap-3 p-3 text-left transition-colors {item.isCurrentFolder
										? 'cursor-not-allowed bg-amber-50 font-medium text-amber-900 dark:bg-amber-900/30 dark:text-amber-100'
										: 'hover:bg-muted/50'} {item.isSelected
										? 'bg-primary text-primary-foreground'
										: ''}"
									onclick={() => (item.isCurrentFolder ? null : selectFolder(item.folder.path))}
									role="radio"
									aria-checked={item.isSelected}
								>
									<Folder class="h-4 w-4" />
									<span>{item.folder.name}</span>
									{#if item.isCurrentFolder}
										<span class="text-muted-foreground text-xs italic">(current)</span>
									{/if}
								</button>
							</div>

							<!-- Render nested folders -->
							{#each item.children as child (child.folder.path)}
								<div
									class="border-border border-b last:border-b-0"
									style="margin-left: {child.depth * 1.5}rem;"
								>
									<div class="flex items-center">
										{#if child.hasSubFolders}
											<button
												type="button"
												class="hover:bg-muted/50 p-2 transition-colors"
												onclick={() => toggleFolder(child.folder.path)}
												aria-expanded={child.isExpanded}
												aria-label={`${child.isExpanded ? 'Collapse' : 'Expand'} ${child.folder.name} folder`}
											>
												<ChevronRight
													class="h-4 w-4 transition-transform {child.isExpanded ? 'rotate-90' : ''}"
												/>
											</button>
										{:else}
											<div class="w-8"></div>
										{/if}

										<button
											type="button"
											class="flex flex-1 items-center gap-3 p-3 text-left transition-colors {child.isCurrentFolder
												? 'cursor-not-allowed bg-amber-50 font-medium text-amber-900 dark:bg-amber-900/30 dark:text-amber-100'
												: 'hover:bg-muted/50'} {child.isSelected
												? 'bg-primary text-primary-foreground'
												: ''}"
											onclick={() =>
												child.isCurrentFolder ? null : selectFolder(child.folder.path)}
											role="radio"
											aria-checked={child.isSelected}
										>
											<Folder class="h-4 w-4" />
											<span>{child.folder.name}</span>
											{#if child.isCurrentFolder}
												<span class="text-muted-foreground text-xs italic">(current)</span>
											{/if}
										</button>
									</div>
								</div>
							{/each}
						</div>
					{/each}
				</div>
			</fieldset>

			<!-- Preview -->
			<div class="bg-muted/50 rounded-lg border p-4">
				<h4 class="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">
					New Location
				</h4>
				<div class="flex items-center gap-3">
					<File class="text-muted-foreground h-4 w-4" />
					<code class="bg-background text-primary rounded border px-2 py-1 font-mono text-sm">
						{finalPath}
					</code>
				</div>
			</div>

			{#if error}
				<div
					class="bg-destructive/10 border-destructive/20 text-destructive rounded-lg border p-3 text-sm"
				>
					{error}
				</div>
			{/if}
		</form>

		<DialogFooter class="gap-3">
			<Button variant="outline" onclick={onClose} disabled={isLoading}>Cancel</Button>
			<Button type="submit" disabled={isLoading || !newDocumentName.trim()} onclick={moveDocument}>
				{#if isLoading}
					Moving...
				{:else}
					Move Document
				{/if}
			</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>
