<script lang="ts">
	import { secretStore, secretsError, secretsLoading } from '$lib/stores/secrets';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import Textarea from '$lib/components/ui/textarea/textarea.svelte';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import {
		Dialog,
		DialogContent,
		DialogDescription,
		DialogFooter,
		DialogHeader,
		DialogTitle
	} from '$lib/components/ui/dialog';

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
			{#if $secretsError}
				<Alert variant="destructive">
					<AlertDescription>{$secretsError}</AlertDescription>
				</Alert>
			{/if}

			<div class="space-y-2">
				<Label for="secret-key">Key</Label>
				<Input
					id="secret-key"
					bind:value={key}
					placeholder="e.g., 'api_key', 'database_url'"
					onkeydown={handleKeydown}
					disabled={$secretsLoading || isEditing}
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
					disabled={$secretsLoading}
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

			<div class="border-border bg-muted rounded-lg border p-3">
				<div class="flex">
					<svg
						class="text-muted-foreground mt-0.5 mr-2 h-4 w-4 flex-shrink-0"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
					<div>
						<p class="text-foreground text-sm font-medium">Usage Example</p>
						<p class="text-muted-foreground mt-1 font-mono text-xs">
							In your documents: My API key is {'{{secret:' + (key || 'your_key') + '}}'}
						</p>
					</div>
				</div>
			</div>
		</div>

		<DialogFooter>
			<Button variant="outline" onclick={handleClose} disabled={$secretsLoading}>Cancel</Button>
			<Button onclick={handleSave} disabled={!key.trim() || !value.trim() || $secretsLoading}>
				{#if $secretsLoading}
					{isEditing ? 'Updating...' : 'Creating...'}
				{:else}
					{isEditing ? 'Update Secret' : 'Create Secret'}
				{/if}
			</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>
