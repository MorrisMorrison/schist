<script lang="ts">
	import { folderActions } from '$lib/stores/documents.svelte';
	import FormDialog from './FormDialog.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Edit } from '@lucide/svelte';
	import InlineError from '$lib/components/ui/InlineError.svelte';
	import type { Folder as FolderType } from '$lib/api/types';
	import { getErrorMessage } from '$lib/utils/error';
	import { folderNameToSegment, getParentPath, isValidFolderName, joinPath } from '$lib/utils/path';

	interface Props {
		folder?: FolderType;
		open?: boolean;
		onClose: () => void;
		onRenamed: () => void;
	}

	let { folder, open = false, onClose, onRenamed }: Props = $props();

	let folderName = $state('');
	let error = $state('');
	let isLoading = $state(false);

	const currentPath = $derived(folder?.path || '');
	const newPath = $derived(joinPath(getParentPath(currentPath), folderName));
	const isValidName = $derived(
		isValidFolderName(folderName) && !(folder && folderName.trim() === folder.name)
	);

	$effect(() => {
		if (folder && open) {
			folderName = folder.name;
			error = '';
		}
	});

	async function renameFolder() {
		if (!isValidName || isLoading || !folder) return;

		isLoading = true;
		error = '';

		try {
			await folderActions.renameFolder(folder.path, folderNameToSegment(folderName));
			onRenamed();
		} catch (err) {
			error = getErrorMessage(err, 'Failed to rename folder');
		} finally {
			isLoading = false;
		}
	}

	function handleClose() {
		if (!isLoading) {
			onClose();
		}
	}
</script>

<FormDialog
	{open}
	title="Rename Folder"
	icon={Edit}
	submitLabel="Rename Folder"
	busyLabel="Renaming..."
	busy={isLoading}
	canSubmit={isValidName}
	onSubmit={renameFolder}
	onClose={handleClose}
	submitTestId="rename-folder-btn"
	cancelTestId="cancel-rename-folder-btn"
>
	<div class="space-y-2">
		<Label for="folder-name" class="text-primary">New Folder Name</Label>
		<Input
			id="folder-name"
			data-testid="folder-name"
			type="text"
			bind:value={folderName}
			placeholder="Enter new folder name"
			class={error && folderName ? 'border-red-500' : ''}
			required
		/>

		{#if error && folderName}
			<InlineError message={error} />
		{/if}
	</div>

	<div class="space-y-2">
		<div class="bg-secondary rounded-lg border p-4">
			<div class="space-y-2">
				<span class="text-secondary text-sm font-medium">Current Path:</span>
				<code class="bg-primary block w-full rounded border px-3 py-2 text-sm text-gray-600"
					>{currentPath}</code
				>
			</div>
		</div>

		<div class="bg-secondary rounded-lg border p-4">
			<div class="space-y-2">
				<span class="text-secondary text-sm font-medium">New Path:</span>
				<code class="bg-primary block w-full rounded border px-3 py-2 text-sm text-blue-600"
					>{newPath}</code
				>
			</div>
		</div>
	</div>
</FormDialog>
