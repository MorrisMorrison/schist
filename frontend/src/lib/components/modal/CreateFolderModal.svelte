<script lang="ts">
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
	import { Folder, AlertCircle } from 'lucide-svelte';
	import { parseError } from '$lib/utils/error';

	interface Props {
		parentPath?: string;
		open?: boolean;
		onClose: () => void;
		onCreated: () => void;
	}

	let { parentPath = '', open = true, onClose, onCreated }: Props = $props();

	let folderName = $state('');
	let error = $state('');
	let errorSeverity = $state<'error' | 'warning' | 'info'>('error');
	let isLoading = $state(false);

	$effect(() => {
		if (open) {
			folderName = '';
			error = '';
			isLoading = false;
		}
	});

	const folderPath = $derived(
		parentPath && parentPath !== '/' ? `${parentPath}/${folderName}` : `/${folderName}`
	);
	const isValidName = $derived(validateFolderName(folderName));

	function validateFolderName(name: string): boolean {
		if (!name.trim()) return false;

		if (!/^[a-zA-Z0-9\-_\s]+$/.test(name)) {
			return false;
		}

		if (name.length > 50) {
			return false;
		}

		return true;
	}

	async function createFolder() {
		if (!isValidName || isLoading) return;

		isLoading = true;
		error = '';

		try {
			const normalizedName = folderName.trim().toLowerCase().replace(/\s+/g, '-');
			const fullPath = parentPath ? `${parentPath}/${normalizedName}` : `/${normalizedName}`;

			await folderActions.createFolder(fullPath);
			onCreated();
		} catch (err) {
			const parsedError = parseError(err);
			error = parsedError.message;
			errorSeverity = parsedError.severity;

			// Log detailed error for debugging
			console.error('Failed to create folder', {
				folderName,
				fullPath: parentPath
					? `${parentPath}/${folderName.trim().toLowerCase().replace(/\s+/g, '-')}`
					: `/${folderName.trim().toLowerCase().replace(/\s+/g, '-')}`,
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
						class={error && folderName ? 'border-red-500' : ''}
						required
					/>

					{#if error && folderName}
						<div
							class="flex items-center gap-2 rounded-md p-2 text-sm {errorSeverity === 'error'
								? 'bg-red-50 text-red-700 dark:bg-red-900/50 dark:text-red-300'
								: errorSeverity === 'warning'
									? 'bg-amber-50 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'
									: 'bg-blue-50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'}"
						>
							<AlertCircle class="h-4 w-4 flex-shrink-0" />
							{error}
						</div>
					{/if}
				</div>

				<div class="bg-secondary rounded-lg border p-4">
					<div class="space-y-2">
						<span class="text-secondary text-sm font-medium">Full Path:</span>
						<code class="bg-primary block w-full rounded border px-3 py-2 text-sm text-blue-600"
							>{folderPath}</code
						>
					</div>
				</div>

				{#if parentPath}
					<div class="text-secondary flex items-center gap-2 text-sm">
						<span class="font-medium">Parent folder:</span>
						<code class="bg-secondary text-primary rounded px-2 py-1">{parentPath}</code>
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
