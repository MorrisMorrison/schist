<script lang="ts">
	import { apiClient } from '$lib/api/client';
	import type { ImportOptions, ImportResult, Folder } from '$lib/api/types';
	import { folderActions } from '$lib/stores/documents';
	import { Button } from '$lib/components/ui/button';
	import {
		Dialog,
		DialogContent,
		DialogHeader,
		DialogTitle,
		DialogFooter
	} from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Upload, AlertCircle, CheckCircle } from 'lucide-svelte';

	interface Props {
		open?: boolean;
		onClose: () => void;
		onSuccess: () => void;
		folders: Folder[];
	}

	let { open = false, onClose, onSuccess, folders }: Props = $props();

	let selectedFiles = $state<FileList | null>(null);
	let targetPath = $state('/');
	let overwriteMode = $state<'skip' | 'overwrite' | 'rename'>('rename');
	let isLoading = $state(false);
	let error = $state('');
	let importResult = $state<ImportResult | null>(null);

	// Reset form when modal opens
	$effect(() => {
		if (open) {
			selectedFiles = null;
			targetPath = '/';
			overwriteMode = 'rename';
			isLoading = false;
			error = '';
			importResult = null;
		}
	});

	const isValidSelection = $derived(
		selectedFiles &&
			selectedFiles.length > 0 &&
			Array.from(selectedFiles).every((file) => file.name.toLowerCase().endsWith('.md'))
	);

	function handleFileSelect(event: Event) {
		const input = event.target as HTMLInputElement;
		selectedFiles = input.files;
		error = '';
	}

	function getFileDisplayText(files: FileList): string {
		if (files.length === 1) {
			return `Selected: ${files[0].name}`;
		}
		return `Selected: ${files.length} files`;
	}

	async function handleImport() {
		if (!selectedFiles || !isValidSelection || isLoading) return;

		isLoading = true;
		error = '';
		importResult = null;

		try {
			const options: ImportOptions = {
				target_path: targetPath,
				overwrite_mode: overwriteMode
			};

			const result = await apiClient.importDocuments(selectedFiles, options);
			importResult = result;

			if (result.failed_count === 0) {
				// All files imported successfully
				await folderActions.loadFolderTree();
				setTimeout(() => {
					onSuccess();
				}, 2000); // Show success message for 2 seconds
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to import documents';
		} finally {
			isLoading = false;
		}
	}

	// Generate folder options for select
	function generateFolderOptions(
		folders: Folder[],
		prefix = ''
	): Array<{ value: string; label: string }> {
		const options = [{ value: '/', label: 'Root' }];

		for (const folder of folders) {
			const path = prefix + '/' + folder.name;
			const displayPath = path === '/' ? 'Root' : path;
			options.push({ value: path, label: displayPath });

			if (folder.sub_folders && folder.sub_folders.length > 0) {
				options.push(...generateFolderOptions(folder.sub_folders, path));
			}
		}

		return options;
	}

	const folderOptions = $derived(generateFolderOptions(folders));
</script>

<Dialog {open} onOpenChange={(openState) => !openState && onClose()}>
	<DialogContent class="max-w-2xl" data-testid="import-documents-modal">
		<DialogHeader>
			<DialogTitle class="flex items-center gap-3">
				<Upload class="h-5 w-5 text-blue-500" />
				Import Documents
			</DialogTitle>
		</DialogHeader>

		{#if !importResult}
			<form
				onsubmit={(e) => {
					e.preventDefault();
					handleImport();
				}}
				class="space-y-6"
			>
				<div class="space-y-4">
					<!-- File Selection -->
					<div class="space-y-2">
						<Label for="file-input">Select Markdown Files</Label>
						<div class="space-y-2">
							<Input
								id="file-input"
								type="file"
								accept=".md"
								multiple
								onchange={handleFileSelect}
								class="file:mr-4 file:rounded-md file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100"
							/>
							{#if selectedFiles && selectedFiles.length > 0}
								<div class="flex items-center gap-2 text-sm text-green-600">
									<CheckCircle class="h-4 w-4" />
									{getFileDisplayText(selectedFiles)}
								</div>
							{/if}
						</div>
					</div>

					<!-- Target Path Selection -->
					<div class="space-y-2">
						<Label for="target-path">Import to Folder</Label>
						<select
							id="target-path"
							bind:value={targetPath}
							class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
						>
							{#each folderOptions as option (option.value)}
								<option value={option.value}>{option.label}</option>
							{/each}
						</select>
					</div>

					<!-- Overwrite Mode -->
					<div class="space-y-2">
						<Label>If file already exists</Label>
						<div class="space-y-2">
							<label class="flex items-center space-x-2">
								<input type="radio" bind:group={overwriteMode} value="rename" />
								<span class="text-sm">Rename (recommended)</span>
							</label>
							<label class="flex items-center space-x-2">
								<input type="radio" bind:group={overwriteMode} value="skip" />
								<span class="text-sm">Skip existing files</span>
							</label>
							<label class="flex items-center space-x-2">
								<input type="radio" bind:group={overwriteMode} value="overwrite" />
								<span class="text-sm text-orange-600">Overwrite existing files</span>
							</label>
						</div>
					</div>
				</div>

				{#if error}
					<div class="flex items-center gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700">
						<AlertCircle class="h-4 w-4 flex-shrink-0" />
						{error}
					</div>
				{/if}

				<DialogFooter>
					<Button type="button" variant="outline" onclick={onClose} disabled={isLoading}>
						Cancel
					</Button>
					<Button type="submit" disabled={!isValidSelection || isLoading}>
						{#if isLoading}
							<div
								class="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-transparent border-t-current"
							></div>
							Importing...
						{:else}
							Import Documents
						{/if}
					</Button>
				</DialogFooter>
			</form>
		{:else}
			<!-- Import Results -->
			<div class="space-y-4">
				<div class="rounded-lg bg-gray-50 p-4">
					<h3 class="mb-2 text-sm font-medium text-gray-900">Import Summary</h3>
					<div class="grid grid-cols-3 gap-4 text-sm">
						<div>
							<span class="text-gray-600">Total Files:</span>
							<span class="ml-1 font-medium">{importResult.total_files}</span>
						</div>
						<div>
							<span class="text-green-600">Imported:</span>
							<span class="ml-1 font-medium">{importResult.imported_count}</span>
						</div>
						<div>
							<span class="text-red-600">Failed:</span>
							<span class="ml-1 font-medium">{importResult.failed_count}</span>
						</div>
					</div>
				</div>

				{#if importResult.success.length > 0}
					<div class="space-y-2">
						<h4 class="text-sm font-medium text-green-700">Successfully Imported</h4>
						<div class="max-h-32 space-y-1 overflow-y-auto">
							{#each importResult.success as doc (doc.final_path)}
								<div class="flex items-center gap-2 rounded bg-green-50 p-2 text-sm">
									<CheckCircle class="h-4 w-4 flex-shrink-0 text-green-600" />
									<span class="truncate">
										<strong>{doc.title}</strong>
										<span class="ml-1 text-gray-600">→ {doc.final_path}</span>
									</span>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				{#if importResult.failed.length > 0}
					<div class="space-y-2">
						<h4 class="text-sm font-medium text-red-700">Failed to Import</h4>
						<div class="max-h-32 space-y-1 overflow-y-auto">
							{#each importResult.failed as failure (failure.original_name)}
								<div class="flex items-start gap-2 rounded bg-red-50 p-2 text-sm">
									<AlertCircle class="mt-0.5 h-4 w-4 flex-shrink-0 text-red-600" />
									<div class="min-w-0">
										<div class="truncate font-medium">{failure.original_name}</div>
										<div class="text-xs text-red-600">{failure.error}</div>
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				<DialogFooter>
					<Button onclick={onClose}>
						{importResult.failed_count === 0 ? 'Done' : 'Close'}
					</Button>
				</DialogFooter>
			</div>
		{/if}
	</DialogContent>
</Dialog>
