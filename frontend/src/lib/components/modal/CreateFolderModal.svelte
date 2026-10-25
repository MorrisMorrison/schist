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
	import { Folder } from '@lucide/svelte';
	import { parseError } from '$lib/utils/error';
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import { folderNameToSegment, isValidFolderName, joinPath } from '$lib/utils/path';

	interface Props {
		parentPath?: string;
		open?: boolean;
		onClose: () => void;
		onCreated: () => void;
	}

	let { parentPath = '', open = true, onClose, onCreated }: Props = $props();

	let folderName = $state('');
	let error = $state('');
	let isLoading = $state(false);

	$effect(() => {
		if (open) {
			folderName = '';
			error = '';
			isLoading = false;
		}
	});

	const folderPath = $derived(joinPath(parentPath, folderName));
	const isValidName = $derived(isValidFolderName(folderName));

	async function createFolder() {
		if (!isValidName || isLoading) return;

		isLoading = true;
		error = '';

		const fullPath = joinPath(parentPath, folderNameToSegment(folderName));

		try {
			await folderActions.createFolder(fullPath);
			onCreated();
		} catch (err) {
			const parsedError = parseError(err);
			error = parsedError.message;

			console.error('Failed to create folder', {
				folderName,
				fullPath,
				error: parsedError
			});
		} finally {
			isLoading = false;
		}
	}
</script>

<Dialog {open} onOpenChange={(openState) => !openState && onClose()}>
	<DialogContent class="max-w-md" data-testid="create-folder-modal">
		<DialogHeader>
			<DialogTitle class="flex items-center gap-3">
				<Folder class="h-5 w-5 text-blue-500" />
				Create New Folder
			</DialogTitle>
		</DialogHeader>

		<form
			onsubmit={(e) => {
				e.preventDefault();
				createFolder();
			}}
			class="space-y-6"
		>
			<div class="space-y-4">
				<div class="space-y-2">
					<label for="folder-name" class="text-primary text-sm font-medium">Folder Name</label>
					<Input
						id="folder-name"
						data-testid="folder-name"
						type="text"
						bind:value={folderName}
						placeholder="Enter folder name"
						class={error && folderName ? 'border-destructive' : ''}
						required
					/>

					{#if error && folderName}
						<ErrorAlert {error} />
					{/if}
				</div>

				<div class="bg-secondary/50 border-border rounded-lg border p-4">
					<div class="space-y-2">
						<span class="text-muted-foreground text-sm font-medium">Full Path:</span>
						<code
							class="bg-muted border-border text-primary block w-full rounded border px-3 py-2 text-sm"
							>{folderPath}</code
						>
					</div>
				</div>

				{#if parentPath}
					<div class="text-muted-foreground flex items-center gap-2 text-sm">
						<span class="font-medium">Parent folder:</span>
						<code class="bg-muted text-foreground rounded px-2 py-1">{parentPath}</code>
					</div>
				{/if}
			</div>

			<DialogFooter>
				<Button
					type="button"
					data-testid="cancel-create-folder-btn"
					variant="outline"
					onclick={onClose}
					disabled={isLoading}
				>
					Cancel
				</Button>
				<Button type="submit" data-testid="create-folder-btn" disabled={!isValidName || isLoading}>
					{#if isLoading}
						Creating...
					{:else}
						Create Folder
					{/if}
				</Button>
			</DialogFooter>
		</form>
	</DialogContent>
</Dialog>
