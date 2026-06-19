<script lang="ts">
	import { folderActions } from '$lib/stores/documents.svelte';
	import { Button } from '$lib/components/ui/button';
	import {
		Dialog,
		DialogContent,
		DialogHeader,
		DialogTitle,
		DialogFooter
	} from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Edit } from '@lucide/svelte';
	import InlineError from '$lib/components/ui/InlineError.svelte';
	import type { Folder as FolderType } from '$lib/api/types';
	import { getErrorMessage } from '$lib/utils/error';

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
	const parentPath = $derived(
		currentPath ? currentPath.split('/').slice(0, -1).join('/') || '/' : '/'
	);
	const newPath = $derived(parentPath === '/' ? `/${folderName}` : `${parentPath}/${folderName}`);
	const isValidName = $derived(validateFolderName(folderName));

	$effect(() => {
		if (folder && open) {
			folderName = folder.name;
			error = '';
		}
	});

	function validateFolderName(name: string): boolean {
		if (!name.trim()) return false;

		if (!/^[a-zA-Z0-9\-_\s]+$/.test(name)) {
			return false;
		}

		if (name.length > 50) {
			return false;
		}

		if (folder && name.trim() === folder.name) {
			return false;
		}

		return true;
	}

	async function renameFolder() {
		if (!isValidName || isLoading || !folder) return;

		isLoading = true;
		error = '';

		try {
			const normalizedName = folderName.trim().toLowerCase().replace(/\s+/g, '-');
			await folderActions.renameFolder(folder.path, normalizedName);
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

<Dialog {open} onOpenChange={(openState) => !openState && handleClose()}>
	<DialogContent class="max-w-md">
		<DialogHeader>
			<DialogTitle class="flex items-center gap-3">
				<Edit class="h-5 w-5 text-blue-500" />
				Rename Folder
			</DialogTitle>
		</DialogHeader>

		<form
			onsubmit={(e) => {
				e.preventDefault();
				renameFolder();
			}}
			class="space-y-6"
		>
			<div class="space-y-4">
				<div class="space-y-2">
					<label for="folder-name" class="text-primary text-sm font-medium">New Folder Name</label>
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
			</div>

			<DialogFooter>
				<Button
					type="button"
					data-testid="cancel-rename-folder-btn"
					variant="outline"
					onclick={handleClose}
					disabled={isLoading}
				>
					Cancel
				</Button>
				<Button data-testid="rename-folder-btn" type="submit" disabled={!isValidName || isLoading}>
					{#if isLoading}
						Renaming...
					{:else}
						Rename Folder
					{/if}
				</Button>
			</DialogFooter>
		</form>
	</DialogContent>
</Dialog>
