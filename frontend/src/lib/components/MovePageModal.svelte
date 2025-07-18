<script lang="ts">
	import { onMount } from 'svelte';
	import { pagesStore, foldersStore, folderActions, pageActions } from '$lib/stores/pages';
	import { getParentPath, normalizePath } from '$lib/api/types';
	import { Move, Folder, File, ChevronRight } from 'lucide-svelte';
	import type { Page, Folder as FolderType } from '$lib/api/types';

	interface Props {
		page: Page;
		onClose: () => void;
		onMoved: () => void;
	}

	let { page, onClose, onMoved }: Props = $props();

	let selectedPath = $state('');
	let newPageName = $state('');
	let isLoading = $state(false);
	let error = $state('');
	let expandedFolders = $state(new Set<string>());

	const availableFolders = $derived($foldersStore.folders);
	const currentPath = $derived(page.metaData.path || `/${page.metaData.slug}`);
	const currentFolder = $derived(getParentPath(currentPath));
	const pageName = $derived(page.metaData.title || page.metaData.slug || 'Untitled');
	const finalPath = $derived(
		selectedPath
			? `${selectedPath}/${newPageName || page.metaData.slug}`
			: `/${newPageName || page.metaData.slug}`
	);

	onMount(() => {
		folderActions.loadFolderTree();
		newPageName = page.metaData.slug || '';
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

	function renderFolderTree(folders: FolderType[], parentPath: string = '', depth: number = 0) {
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
				children:
					hasSubFolders && isExpanded
						? renderFolderTree(folder.sub_folders, folder.path, depth + 1)
						: []
			};
		});
	}

	const folderTree = $derived(renderFolderTree(availableFolders));

	async function movePage() {
		if (isLoading) return;

		if (!newPageName.trim()) {
			error = 'Page name is required';
			return;
		}

		if (finalPath === currentPath) {
			error = 'Please select a different location or change the page name';
			return;
		}

		isLoading = true;
		error = '';

		try {
			await pageActions.movePagePath(currentPath, finalPath);
			onMoved();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to move page';
		} finally {
			isLoading = false;
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			onClose();
		}
	}

	function handleOverlayKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			onClose();
		}
	}

	function handleModalKeydown(event: KeyboardEvent) {
		// Stop propagation for keyboard events on modal content
		event.stopPropagation();
	}
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="modal-overlay" onclick={onClose} onkeydown={handleOverlayKeydown} role="button" tabindex="0" aria-label="Close modal overlay">
	<div class="modal" onclick={(e) => e.stopPropagation()} onkeydown={handleModalKeydown} role="dialog" aria-labelledby="modal-title" aria-modal="true" tabindex="-1">
		<div class="modal-header">
			<div class="modal-title">
				<Move class="modal-icon" />
				<h3 id="modal-title">Move Page</h3>
			</div>
			<button type="button" class="modal-close" onclick={onClose} aria-label="Close modal">
				×
			</button>
		</div>

		<form
			onsubmit={(e) => {
				e.preventDefault();
				movePage();
			}}
		>
			<div class="modal-body">
				<!-- Current Location -->
				<div class="current-location">
					<h4>Current Location</h4>
					<div class="location-info">
						<File class="file-icon" />
						<div>
							<div class="page-name">{pageName}</div>
							<div class="page-path">{currentPath}</div>
						</div>
					</div>
				</div>

				<!-- New Page Name -->
				<div class="form-group">
					<label for="page-name">Page Name (slug)</label>
					<input
						id="page-name"
						type="text"
						bind:value={newPageName}
						placeholder="Enter page name"
						required
					/>
				</div>

				<!-- Destination Folder -->
				<fieldset class="form-group">
					<legend>Destination Folder</legend>
					<div class="folder-selector" role="radiogroup" aria-label="Select destination folder">
						<!-- Root folder option -->
						<div class="folder-option">
							<button
								type="button"
								class="folder-button"
								class:selected={selectedPath === ''}
								onclick={() => selectFolder('')}
								role="radio"
								aria-checked={selectedPath === ''}
							>
								<Folder class="folder-icon" />
								<span>Root (/) - All Documentation</span>
							</button>
						</div>

						<!-- Folder tree -->
						{#each folderTree as item}
							<div class="folder-item" style="margin-left: {item.depth * 1.5}rem;">
								<div class="folder-option">
									{#if item.hasSubFolders}
										<button
											type="button"
											class="expand-button"
											onclick={() => toggleFolder(item.folder.path)}
											aria-expanded={item.isExpanded}
											aria-label={`${item.isExpanded ? 'Collapse' : 'Expand'} ${item.folder.name} folder`}
										>
											<ChevronRight class="expand-icon {item.isExpanded ? 'expanded' : ''}" />
										</button>
									{:else}
										<div class="expand-spacer"></div>
									{/if}

									<button
										type="button"
										class="folder-button"
										class:selected={item.isSelected}
										class:current={item.isCurrentFolder}
										onclick={() => selectFolder(item.folder.path)}
										disabled={item.isCurrentFolder}
										role="radio"
										aria-checked={item.isSelected}
										aria-disabled={item.isCurrentFolder}
									>
										<Folder class="folder-icon" />
										<span>{item.folder.name}</span>
										{#if item.isCurrentFolder}
											<span class="current-label">(current)</span>
										{/if}
									</button>
								</div>

								<!-- Render nested folders -->
								{#each item.children as child}
									<div class="folder-item" style="margin-left: {child.depth * 1.5}rem;">
										<div class="folder-option">
											{#if child.hasSubFolders}
												<button
													type="button"
													class="expand-button"
													onclick={() => toggleFolder(child.folder.path)}
													aria-expanded={child.isExpanded}
													aria-label={`${child.isExpanded ? 'Collapse' : 'Expand'} ${child.folder.name} folder`}
												>
													<ChevronRight class="expand-icon {child.isExpanded ? 'expanded' : ''}" />
												</button>
											{:else}
												<div class="expand-spacer"></div>
											{/if}

											<button
												type="button"
												class="folder-button"
												class:selected={child.isSelected}
												class:current={child.isCurrentFolder}
												onclick={() => selectFolder(child.folder.path)}
												disabled={child.isCurrentFolder}
												role="radio"
												aria-checked={child.isSelected}
												aria-disabled={child.isCurrentFolder}
											>
												<Folder class="folder-icon" />
												<span>{child.folder.name}</span>
												{#if child.isCurrentFolder}
													<span class="current-label">(current)</span>
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
				<div class="move-preview">
					<h4>New Location</h4>
					<div class="preview-path">
						<File class="file-icon" />
						<code>{finalPath}</code>
					</div>
				</div>

				{#if error}
					<div class="error-message">
						{error}
					</div>
				{/if}
			</div>

			<div class="modal-footer">
				<button type="button" class="btn btn-secondary" onclick={onClose} disabled={isLoading}>
					Cancel
				</button>
				<button type="submit" class="btn btn-primary" disabled={isLoading || !newPageName.trim()}>
					{#if isLoading}
						Moving...
					{:else}
						Move Page
					{/if}
				</button>
			</div>
		</form>
	</div>
</div>

<style>
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		backdrop-filter: blur(2px);
	}

	.modal {
		background: var(--color-background);
		border: 1px solid var(--color-border);
		border-radius: 0.75rem;
		max-width: 600px;
		width: 90%;
		max-height: 90vh;
		overflow-y: auto;
		box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1.5rem;
		border-bottom: 1px solid var(--color-border);
		background: var(--color-background-secondary);
		border-radius: 0.75rem 0.75rem 0 0;
	}

	.modal-title {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.modal-title h3 {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--color-text);
	}


	.modal-close {
		background: none;
		border: none;
		font-size: 1.5rem;
		cursor: pointer;
		color: var(--color-text-secondary);
		padding: 0.25rem;
		border-radius: 0.25rem;
		transition: all 0.2s ease;
	}

	.modal-close:hover {
		background: var(--color-background-tertiary);
	}

	.modal-body {
		padding: 1.5rem;
	}

	.current-location {
		margin-bottom: 1.5rem;
		padding: 1rem;
		background: var(--color-background-secondary);
		border-radius: 0.5rem;
		border: 1px solid var(--color-border);
	}

	.current-location h4 {
		margin: 0 0 0.75rem 0;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.location-info {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}


	.page-name {
		font-weight: 500;
		color: var(--color-text);
		margin-bottom: 0.25rem;
	}

	.page-path {
		font-size: 0.875rem;
		color: var(--color-text-secondary);
		font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
	}

	.form-group {
		margin-bottom: 1.5rem;
	}

	.form-group label {
		display: block;
		margin-bottom: 0.5rem;
		font-weight: 500;
		color: var(--color-text);
	}

	.form-group legend {
		display: block;
		margin-bottom: 0.5rem;
		font-weight: 500;
		color: var(--color-text);
		padding: 0;
		border: none;
		font-size: inherit;
	}

	fieldset.form-group {
		border: none;
		padding: 0;
		margin: 0 0 1.5rem 0;
	}

	.form-group input {
		width: 100%;
		padding: 0.75rem;
		border: 1px solid var(--color-border);
		border-radius: 0.5rem;
		font-size: 1rem;
		background: var(--color-background);
		color: var(--color-text);
		transition: all 0.2s ease;
	}

	.form-group input:focus {
		outline: none;
		border-color: var(--color-primary);
		box-shadow: 0 0 0 3px rgba(var(--color-primary-rgb), 0.1);
	}

	.folder-selector {
		max-height: 300px;
		overflow-y: auto;
		border: 1px solid var(--color-border);
		border-radius: 0.5rem;
		background: var(--color-background);
	}

	.folder-option {
		display: flex;
		align-items: center;
		border-bottom: 1px solid var(--color-border);
	}

	.folder-option:last-child {
		border-bottom: none;
	}

	.expand-button {
		background: none;
		border: none;
		padding: 0.75rem;
		cursor: pointer;
		color: var(--color-text-secondary);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.expand-spacer {
		width: 2.5rem;
	}


	.folder-button {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem;
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
		transition: all 0.2s ease;
	}

	.folder-button:hover:not(:disabled) {
		background: var(--color-background-secondary);
	}

	.folder-button.selected {
		background: var(--color-primary);
		color: white;
	}

	.folder-button.current {
		opacity: 0.5;
		cursor: not-allowed;
	}


	.current-label {
		font-size: 0.75rem;
		color: var(--color-text-tertiary);
		font-style: italic;
	}

	.move-preview {
		margin-bottom: 1.5rem;
		padding: 1rem;
		background: var(--color-background-secondary);
		border-radius: 0.5rem;
		border: 1px solid var(--color-border);
	}

	.move-preview h4 {
		margin: 0 0 0.75rem 0;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.preview-path {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.preview-path code {
		font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
		font-size: 0.875rem;
		color: var(--color-primary);
		background: var(--color-background);
		padding: 0.5rem;
		border-radius: 0.25rem;
		border: 1px solid var(--color-border);
	}

	.error-message {
		padding: 0.75rem;
		background: rgba(var(--color-error-rgb), 0.1);
		border: 1px solid rgba(var(--color-error-rgb), 0.2);
		border-radius: 0.5rem;
		color: var(--color-error);
		font-size: 0.875rem;
		margin-bottom: 1rem;
	}

	.modal-footer {
		display: flex;
		gap: 0.75rem;
		justify-content: flex-end;
		padding: 1.5rem;
		border-top: 1px solid var(--color-border);
		background: var(--color-background-secondary);
		border-radius: 0 0 0.75rem 0.75rem;
	}

	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		border-radius: 0.375rem;
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
		text-decoration: none;
		border: none;
		outline: none;
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-primary {
		background: var(--blue-primary);
		color: white;
	}

	.btn-primary:hover:not(:disabled) {
		background: var(--blue-secondary);
	}

	.btn-primary:focus {
		background: var(--blue-secondary);
		box-shadow: 0 0 0 2px var(--blue-primary);
	}

	.btn-secondary {
		background: var(--bg-secondary);
		color: var(--text-primary);
	}

	.btn-secondary:hover:not(:disabled) {
		background: var(--gray-hover);
	}

	.btn-secondary:focus {
		background: var(--gray-active);
		box-shadow: 0 0 0 2px var(--gray-active);
	}

	@media (max-width: 768px) {
		.modal {
			width: 95%;
			margin: 1rem;
		}

		.modal-header,
		.modal-body,
		.modal-footer {
			padding: 1rem;
		}
	}
</style>
