<script lang="ts">
	import { folderActions } from '$lib/stores/pages';
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

	const folderPath = $derived(parentPath ? `${parentPath}/${folderName}` : `/${folderName}`);
	const isValidName = $derived(validateFolderName(folderName));

	function validateFolderName(name: string): boolean {
		if (!name.trim()) return false;

		// Check for invalid characters
		if (!/^[a-zA-Z0-9\-_\s]+$/.test(name)) {
			// error = 'Folder name can only contain letters, numbers, hyphens, underscores, and spaces';
			return false;
		}

		// Check length
		if (name.length > 50) {
			// error = 'Folder name must be 50 characters or less';
			return false;
		}

		// Check for reserved names
		const reserved = ['api', 'admin', 'pages', 'folders', 'auth', 'docs'];
		if (reserved.includes(name.toLowerCase())) {
			// error = 'This folder name is reserved';
			return false;
		}

		// error = '';
		return true;
	}

	async function createFolder() {
		if (!isValidName || isLoading) return;

		isLoading = true;
		error = '';

		try {
			// Normalize the folder name (convert to URL-friendly format)
			const normalizedName = folderName.trim().toLowerCase().replace(/\s+/g, '-');
			const fullPath = parentPath ? `${parentPath}/${normalizedName}` : `/${normalizedName}`;

			await folderActions.createFolder(fullPath);
			onCreated();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create folder';
		} finally {
			isLoading = false;
		}
	}
</script>

<Dialog {open} onOpenChange={(openState) => !openState && onClose()}>
	<DialogContent class="max-w-md">
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
						type="text"
						bind:value={folderName}
						placeholder="Enter folder name"
						class={error && folderName ? 'border-red-500' : ''}
						required
					/>

					{#if error && folderName}
						<div class="flex items-center gap-2 rounded-md bg-red-50 p-2 text-sm text-red-700">
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
				<Button type="button" variant="outline" onclick={onClose} disabled={isLoading}>
					Cancel
				</Button>
				<Button type="submit" disabled={!isValidName || isLoading}>
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
