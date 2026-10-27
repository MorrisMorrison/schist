<script lang="ts">
	import { secretStore } from '#lib/stores/secrets.svelte.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import { Input } from '#lib/components/ui/input/index.ts';
	import { Label } from '#lib/components/ui/label/index.ts';
	import Textarea from '#lib/components/ui/textarea/textarea.svelte';
	import { Alert, AlertDescription, AlertTitle } from '#lib/components/ui/alert/index.ts';
	import { Info } from '@lucide/svelte';
	import {
		Dialog,
		DialogContent,
		DialogDescription,
		DialogFooter,
		DialogHeader,
		DialogTitle
	} from '#lib/components/ui/dialog/index.ts';

	interface Props {
		open?: boolean;
		secretKey?: string; // If provided, editing existing secret
		title?: string;
		onsuccess?: (event: CustomEvent<void>) => void;
		oncancel?: (event: CustomEvent<void>) => void;
	}

	let { open = $bindable(false), secretKey, title, onsuccess, oncancel }: Props = $props();

	let key = $state('');
	let value = $state('');
	let isEditing = $derived(!!secretKey);

	// Update form when secretKey changes
	$effect(() => {
		if (open) {
			if (secretKey) {
				key = secretKey;
				// For security, don't pre-load the existing value
				value = '';
			} else {
				key = '';
				value = '';
			}
		}
	});

	async function handleSave() {
		if (!key.trim() || !value.trim()) {
			return;
		}

		try {
			if (isEditing) {
				await secretStore.updateSecret(secretKey!, { value: value.trim() });
			} else {
				await secretStore.createSecret({ key: key.trim(), value: value.trim() });
			}

			onsuccess?.(new CustomEvent('success'));
			handleClose();
		} catch {
			// Error handled by store
		}
	}

	function handleClose() {
		open = false;
		key = '';
		value = '';
		secretStore.clearError();
		oncancel?.(new CustomEvent('cancel'));
	}

	function handleKeydown(event: KeyboardEvent) {
		if (
			event.key === 'Enter' &&
			!event.shiftKey &&
			event.target !== document.querySelector('textarea')
		) {
			event.preventDefault();
			handleSave();
		}
	}
</script>

<Dialog bind:open>
	<DialogContent class="sm:max-w-md">
		<DialogHeader>
			<DialogTitle>
				{title || (isEditing ? `Edit Secret: ${secretKey}` : 'Create New Secret')}
			</DialogTitle>
			<DialogDescription>
				{#if isEditing}
					Update the value for this secret. The key cannot be changed.
				{:else}
					Create a new encrypted secret that can be referenced in your documents.
				{/if}
			</DialogDescription>
		</DialogHeader>

		<div class="space-y-4">
			{#if secretStore.error}
				<Alert variant="destructive">
					<AlertDescription>{secretStore.error}</AlertDescription>
				</Alert>
			{/if}

			<div class="space-y-2">
				<Label for="secret-key">Key</Label>
				<Input
					id="secret-key"
					bind:value={key}
					placeholder="e.g., 'api_key', 'database_url'"
					onkeydown={handleKeydown}
					disabled={secretStore.loading || isEditing}
					class="w-full font-mono"
				/>
				<p class="text-muted-foreground text-sm">
					{#if isEditing}
						The secret key cannot be changed when editing.
					{:else}
						Use lowercase letters, numbers, and underscores. This will be referenced as {'{{secret:' +
							key +
							'}}'}
					{/if}
				</p>
			</div>

			<div class="space-y-2">
				<Label for="secret-value">Value</Label>
				<Textarea
					id="secret-value"
					bind:value
					placeholder="Enter the secret value..."
					disabled={secretStore.loading}
					class="min-h-24 w-full font-mono"
					rows={3}
				/>
				<p class="text-muted-foreground text-sm">
					{#if isEditing}
						Enter the new value for this secret.
					{:else}
						This value will be encrypted and stored securely.
					{/if}
				</p>
			</div>

			<Alert variant="muted" role="note">
				<Info />
				<AlertTitle>Usage Example</AlertTitle>
				<AlertDescription class="font-mono text-xs">
					In your documents: My API key is {'{{secret:' + (key || 'your_key') + '}}'}
				</AlertDescription>
			</Alert>
		</div>

		<DialogFooter>
			<Button variant="outline" onclick={handleClose} disabled={secretStore.loading}>Cancel</Button>
			<Button onclick={handleSave} disabled={!key.trim() || !value.trim() || secretStore.loading}>
				{#if secretStore.loading}
					{isEditing ? 'Updating...' : 'Creating...'}
				{:else}
					{isEditing ? 'Update Secret' : 'Create Secret'}
				{/if}
			</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>
