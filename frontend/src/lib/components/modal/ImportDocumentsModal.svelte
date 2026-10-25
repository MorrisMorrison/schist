<script lang="ts">
	import { apiClient } from '$lib/api/client';
	import type { ImportOptions, ImportResult, Folder } from '$lib/api/types';
	import { folderActions, documentActions } from '$lib/stores/documents.svelte';
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
	import * as Select from '$lib/components/ui/select';
	import * as RadioGroup from '$lib/components/ui/radio-group';
	import { Upload, AlertCircle, CheckCircle } from '@lucide/svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import InlineError from '$lib/components/ui/InlineError.svelte';
	import { getErrorMessage } from '$lib/utils/error';

	interface Props {
		open?: boolean;
		onClose: () => void;
		onSuccess: () => void;
		folders: Folder[];
	}

	let { open = false, onClose, onSuccess, folders }: Props = $props();

	let selectedFiles = $state<FileList | null>(null);
	let targetPath = $state('/');
	type OverwriteMode = 'skip' | 'overwrite' | 'rename';
	const overwriteModes: { value: OverwriteMode; label: string; class?: string }[] = [
		{ value: 'skip', label: 'Skip' },
		{ value: 'rename', label: 'Rename' },
		{ value: 'overwrite', label: 'Overwrite', class: 'text-orange-600' }
	];
	let overwriteMode = $state<OverwriteMode>('rename');
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

			if (result.imported_count > 0) {
				await Promise.all([folderActions.loadFolderTree(), documentActions.loadDocuments()]);
			}

			if (result.failed_count === 0) {
				setTimeout(() => {
					onSuccess();
				}, 2000);
			}
		} catch (err) {
			error = getErrorMessage(err, 'Failed to import documents');
		} finally {
			isLoading = false;
		}
	}

	function generateFolderOptions(
		folders: Folder[],
		prefix = ''
	): Array<{ value: string; label: string }> {
		// Only the top level gets the Root option; recursive calls for sub-folders
		// must not repeat it (a duplicate '/' key breaks the keyed {#each}).
		const options = prefix ? [] : [{ value: '/', label: 'Root' }];

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
								class="h-12 file:mr-4 file:rounded-md file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100"
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
						<Select.Root type="single" items={folderOptions} bind:value={targetPath}>
							<Select.Trigger id="target-path" class="w-full">
								<Select.Value />
							</Select.Trigger>
							<Select.Content>
								{#each folderOptions as option (option.value)}
									<Select.Item {...option} />
								{/each}
							</Select.Content>
						</Select.Root>
					</div>

					<!-- Overwrite Mode -->
					<div class="space-y-2">
						<Label id="overwrite-mode-label">If file already exists</Label>
						<RadioGroup.Root
							class="gap-2"
							aria-labelledby="overwrite-mode-label"
							bind:value={() => overwriteMode, (value) => (overwriteMode = value as OverwriteMode)}
						>
							{#each overwriteModes as mode (mode.value)}
								<div class="flex items-center gap-2">
									<RadioGroup.Item id="overwrite-mode-{mode.value}" value={mode.value} />
									<Label for="overwrite-mode-{mode.value}" class="font-normal {mode.class ?? ''}"
										>{mode.label}</Label
									>
								</div>
							{/each}
						</RadioGroup.Root>
					</div>
				</div>

				{#if error}
					<InlineError message={error} class="p-3" />
				{/if}

				<DialogFooter>
					<Button type="button" variant="outline" onclick={onClose} disabled={isLoading}>
						Cancel
					</Button>
					<Button type="submit" disabled={!isValidSelection || isLoading}>
						{#if isLoading}
							<LoadingSpinner size="sm" class="mr-2" />
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
				<div class="bg-muted rounded-lg p-4">
					<h3 class="text-foreground mb-2 text-sm font-medium">Import Summary</h3>
					<div class="grid grid-cols-4 gap-4 text-sm">
						<div>
							<span class="text-muted-foreground">Total Files:</span>
							<span class="text-foreground ml-1 font-medium">{importResult.total_files}</span>
						</div>
						<div>
							<span class="text-primary">Imported:</span>
							<span class="text-foreground ml-1 font-medium">{importResult.imported_count}</span>
						</div>
						<div>
							<span class="text-muted-foreground">Skipped:</span>
							<span class="text-foreground ml-1 font-medium">{importResult.skipped_count}</span>
						</div>
						<div>
							<span class="text-red-600 dark:text-red-400">Failed:</span>
							<span class="text-foreground ml-1 font-medium">{importResult.failed_count}</span>
						</div>
					</div>
				</div>

				{#if importResult.success.length > 0}
					<div class="space-y-2">
						<h4 class="text-sm font-medium text-green-700 dark:text-green-400">
							Successfully Imported
						</h4>
						<div class="max-h-32 space-y-1 overflow-y-auto">
							{#each importResult.success as doc (doc.final_path)}
								<div
									class="flex items-center gap-2 rounded border border-green-200 bg-green-50 p-2 text-sm dark:border-green-800 dark:bg-green-950/20"
								>
									<CheckCircle class="h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400" />
									<span class="truncate">
										<strong class="text-foreground">{doc.title}</strong>
										<span class="text-muted-foreground ml-1">→ {doc.final_path}</span>
									</span>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				{#if importResult.skipped && importResult.skipped.length > 0}
					<div class="space-y-2">
						<h4 class="text-sm font-medium text-yellow-700 dark:text-yellow-400">Skipped Files</h4>
						<div class="max-h-32 space-y-1 overflow-y-auto">
							{#each importResult.skipped as doc (doc.final_path)}
								<div
									class="flex items-center gap-2 rounded border border-yellow-200 bg-yellow-50 p-2 text-sm dark:border-yellow-800 dark:bg-yellow-950/20"
								>
									<AlertCircle class="h-4 w-4 flex-shrink-0 text-yellow-600 dark:text-yellow-400" />
									<span class="truncate">
										<strong class="text-foreground">{doc.title}</strong>
										<span class="text-muted-foreground ml-1"
											>→ {doc.final_path} (already exists)</span
										>
									</span>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				{#if importResult.failed.length > 0}
					<div class="space-y-2">
						<h4 class="text-sm font-medium text-red-700 dark:text-red-400">Failed to Import</h4>
						<div class="max-h-32 space-y-1 overflow-y-auto">
							{#each importResult.failed as failure (failure.original_name)}
								<div
									class="flex items-start gap-2 rounded border border-red-200 bg-red-50 p-2 text-sm dark:border-red-800 dark:bg-red-950/20"
								>
									<AlertCircle
										class="mt-0.5 h-4 w-4 flex-shrink-0 text-red-600 dark:text-red-400"
									/>
									<div class="min-w-0">
										<div class="text-foreground truncate font-medium">{failure.original_name}</div>
										<div class="text-xs text-red-600 dark:text-red-400">{failure.error}</div>
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
