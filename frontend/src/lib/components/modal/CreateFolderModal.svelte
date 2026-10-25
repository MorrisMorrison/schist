<script lang="ts">
	import { folderActions } from '$lib/stores/documents.svelte';
	import FormDialog from './FormDialog.svelte';
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

<FormDialog
	{open}
	title="Create New Folder"
	icon={Folder}
	submitLabel="Create Folder"
	busyLabel="Creating..."
	busy={isLoading}
	canSubmit={isValidName}
	onSubmit={createFolder}
	{onClose}
	testId="create-folder-modal"
	submitTestId="create-folder-btn"
	cancelTestId="cancel-create-folder-btn"
>
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
</FormDialog>
