<script lang="ts">
	import { passkeyStore, passkeyError, passkeyLoading } from '$lib/stores/passkeys';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import {
		Dialog,
		DialogContent,
		DialogDescription,
		DialogFooter,
		DialogHeader,
		DialogTitle
	} from '$lib/components/ui/dialog';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';

	interface Props {
		open?: boolean;
		title?: string;
		description?: string;
		onsuccess?: (event: CustomEvent<{ credentialId: string }>) => void;
		oncancel?: (event: CustomEvent<void>) => void;
	}

	let {
		open = $bindable(false),
		title = 'Set Up Passkey Security',
		description = 'Create a secure passkey to protect your secrets and API keys.',
		onsuccess,
		oncancel
	}: Props = $props();

	let passkeyName = $state('');
	let step = $state<'setup' | 'creating' | 'success'>('setup');
	let credentialId = $state('');

	async function handleCreatePasskey() {
		if (!passkeyName.trim()) {
			return;
		}

		step = 'creating';

		try {
			credentialId = await passkeyStore.createPasskey(passkeyName.trim());
			step = 'success';

			// Auto-close after showing success
			setTimeout(() => {
				onsuccess?.(new CustomEvent('success', { detail: { credentialId } }));
				handleClose();
			}, 2000);
		} catch {
			step = 'setup';
		}
	}

	function handleClose() {
		open = false;
		passkeyName = '';
		step = 'setup';
		credentialId = '';
		passkeyStore.clearError();
		oncancel?.(new CustomEvent('cancel'));
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && step === 'setup') {
			handleCreatePasskey();
		}
	}
</script>

<Dialog bind:open>
	<DialogContent class="sm:max-w-md">
		<DialogHeader>
			<DialogTitle>{title}</DialogTitle>
			<DialogDescription>
				{description}
			</DialogDescription>
		</DialogHeader>

		<div class="space-y-4">
			{#if step === 'setup'}
				<div class="space-y-2">
					<Label for="passkey-name">Passkey Name</Label>
					<Input
						id="passkey-name"
						bind:value={passkeyName}
						placeholder="e.g., 'MacBook Pro' or 'Main Device'"
						onkeydown={handleKeydown}
						disabled={$passkeyLoading}
						class="w-full"
					/>
					<p class="text-muted-foreground text-sm">
						Give your passkey a memorable name to identify this device.
					</p>
				</div>

				{#if $passkeyError}
					<Alert variant="destructive">
						<AlertDescription>{$passkeyError}</AlertDescription>
					</Alert>
				{/if}

				<div class="bg-muted/50 rounded-lg p-4">
					<h4 class="mb-2 text-sm font-medium">🔐 How it works:</h4>
					<ul class="text-muted-foreground space-y-1 text-sm">
						<li>• Your passkey will secure all secrets and API tokens</li>
						<li>• Only this device can access your encrypted secrets</li>
						<li>• No passwords to remember - your device handles authentication</li>
					</ul>
				</div>
			{:else if step === 'creating'}
				<div class="flex flex-col items-center space-y-4 py-6">
					<LoadingSpinner size="lg" />
					<p class="text-muted-foreground text-sm">Creating your passkey...</p>
					<p class="text-muted-foreground text-center text-xs">
						This will generate a unique cryptographic key for securing your secrets.
					</p>
				</div>
			{:else if step === 'success'}
				<div class="flex flex-col items-center space-y-4 py-6">
					<div
						class="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900"
					>
						<svg
							class="h-6 w-6 text-green-600 dark:text-green-400"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M5 13l4 4L19 7"
							/>
						</svg>
					</div>
					<div class="text-center">
						<p class="text-sm font-medium">Passkey Created Successfully!</p>
						<p class="text-muted-foreground mt-1 text-xs">
							Your secrets are now protected with "{passkeyName}"
						</p>
					</div>
				</div>
			{/if}
		</div>

		<DialogFooter>
			{#if step === 'setup'}
				<Button variant="outline" onclick={handleClose} disabled={$passkeyLoading}>Cancel</Button>
				<Button onclick={handleCreatePasskey} disabled={!passkeyName.trim() || $passkeyLoading}>
					{#if $passkeyLoading}
						Creating...
					{:else}
						Create Passkey
					{/if}
				</Button>
			{:else if step === 'creating'}
				<Button variant="outline" disabled>Creating...</Button>
			{/if}
		</DialogFooter>
	</DialogContent>
</Dialog>
