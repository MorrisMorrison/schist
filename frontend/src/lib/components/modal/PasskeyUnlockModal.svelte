<script lang="ts">
	import { passkeyStore, passkeyError, passkeyLoading } from '$lib/stores/passkeys';
	import { Button } from '$lib/components/ui/button';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import {
		Dialog,
		DialogContent,
		DialogDescription,
		DialogFooter,
		DialogHeader,
		DialogTitle
	} from '$lib/components/ui/dialog';
	import { isWebAuthnSupported, isPlatformAuthenticatorAvailable } from '$lib/utils/webauthn';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';

	interface Props {
		open?: boolean;
		title?: string;
		description?: string;
		onsuccess?: (event: CustomEvent<void>) => void;
		oncancel?: (event: CustomEvent<void>) => void;
	}

	let {
		open = $bindable(false),
		title = 'Unlock Your Secrets',
		description = 'Use your passkey to unlock your encrypted secrets and API keys.',
		onsuccess,
		oncancel
	}: Props = $props();

	let step = $state<'ready' | 'authenticating' | 'success'>('ready');
	let webAuthnSupported = $state(true);
	let platformAuthAvailable = $state(false);

	// Check WebAuthn support when modal opens
	$effect(() => {
		if (open) {
			webAuthnSupported = isWebAuthnSupported();
			if (webAuthnSupported) {
				isPlatformAuthenticatorAvailable().then((available) => {
					platformAuthAvailable = available;
				});
			}
		}
	});

	async function handleWebAuthnUnlock() {
		if (step === 'authenticating') return;

		step = 'authenticating';

		try {
			await passkeyStore.authenticateWithPasskey();
			step = 'success';

			// Auto-close after showing success briefly
			setTimeout(() => {
				onsuccess?.(new CustomEvent('success'));
				handleClose();
			}, 1500);
		} catch {
			step = 'ready';
			// Error is handled by the store
		}
	}

	function handleClose() {
		open = false;
		step = 'ready';
		passkeyStore.clearError();
		oncancel?.(new CustomEvent('cancel'));
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
			{#if !webAuthnSupported}
				<Alert variant="destructive">
					<AlertDescription>
						WebAuthn is not supported in this browser. Please use a modern browser with passkey
						support.
					</AlertDescription>
				</Alert>
			{:else if step === 'ready'}
				<div class="flex flex-col items-center space-y-4 py-6">
					<div class="bg-primary/10 flex h-16 w-16 items-center justify-center rounded-full">
						<svg class="text-primary h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-3a1 1 0 011-1h2.586l6.414-6.414z"
							/>
						</svg>
					</div>
					<div class="text-center">
						<p class="text-sm font-medium">Ready to unlock your secrets</p>
						<p class="text-muted-foreground mt-1 text-xs">
							{platformAuthAvailable
								? 'Use Touch ID, Face ID, or Windows Hello to authenticate'
								: "Use your device's security key to authenticate"}
						</p>
					</div>
				</div>

				{#if $passkeyError}
					<Alert variant="destructive">
						<AlertDescription>{$passkeyError}</AlertDescription>
					</Alert>
				{/if}

				<div class="bg-muted/50 rounded-lg p-3">
					<p class="text-muted-foreground text-xs">
						🔐 Your browser will prompt you to authenticate using your registered passkey. This will
						securely unlock your encrypted secrets.
					</p>
				</div>
			{:else if step === 'authenticating'}
				<div class="flex flex-col items-center space-y-4 py-6">
					<LoadingSpinner size="lg" />
					<div class="text-center">
						<p class="text-sm font-medium">Authenticating...</p>
						<p class="text-muted-foreground text-xs">
							Please follow your browser's authentication prompt
						</p>
					</div>
				</div>
			{:else if step === 'success'}
				<div class="flex flex-col items-center space-y-4 py-6">
					<div class="bg-accent flex h-12 w-12 items-center justify-center rounded-full">
						<svg class="text-primary h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M5 13l4 4L19 7"
							/>
						</svg>
					</div>
					<div class="text-center">
						<p class="text-sm font-medium">Secrets Unlocked!</p>
						<p class="text-muted-foreground text-xs">
							You can now access your encrypted secrets and API keys
						</p>
					</div>
				</div>
			{/if}
		</div>

		<DialogFooter>
			{#if step === 'ready'}
				<Button variant="outline" onclick={handleClose} disabled={$passkeyLoading}>Cancel</Button>
				<Button
					onclick={handleWebAuthnUnlock}
					disabled={!webAuthnSupported || $passkeyLoading}
					class="bg-primary"
				>
					{#if $passkeyLoading}
						Authenticating...
					{:else}
						Unlock with Passkey
					{/if}
				</Button>
			{:else if step === 'authenticating'}
				<Button variant="outline" disabled>Authenticating...</Button>
			{/if}
		</DialogFooter>
	</DialogContent>
</Dialog>
