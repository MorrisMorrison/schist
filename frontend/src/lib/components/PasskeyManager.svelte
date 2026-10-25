<script lang="ts">
	import { formatDateTime } from '$lib/utils/date';
	import { onMount } from 'svelte';
	import { passkeyStore } from '$lib/stores/passkeys.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import PasskeySetupModal from './modal/PasskeySetupModal.svelte';
	import { Shield, Key, Plus, Trash2, Loader2, Info } from '@lucide/svelte';
	import LoadingRow from '$lib/components/LoadingRow.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';

	let showSetupModal = $state(false);
	let deletingPasskey: string | null = $state(null);

	// Load failures are shown through passkeyStore.error; swallow the rethrown
	// rejection so it doesn't surface as an unhandled promise rejection.
	function reload() {
		passkeyStore.loadStatus().catch(() => {});
		passkeyStore.loadPasskeys().catch(() => {});
	}

	onMount(reload);

	async function handleDeletePasskey(passkey: { id: string; name: string }) {
		if (!confirm(`Delete passkey "${passkey.name}"? This cannot be undone.`)) {
			return;
		}

		deletingPasskey = passkey.id;

		try {
			await passkeyStore.deletePasskey(passkey.id);
		} catch {
			// error surfaced via passkeyStore.error; deletingPasskey reset in finally
		} finally {
			deletingPasskey = null;
		}
	}

	function handleSetupSuccess() {
		showSetupModal = false;
		reload();
	}
</script>

<Card>
	<CardHeader>
		<CardTitle>Passkey Security</CardTitle>
		<CardDescription>Manage your authentication passkeys.</CardDescription>
	</CardHeader>

	<CardContent class="space-y-4">
		{#if passkeyStore.error}
			<Alert variant="destructive">
				<AlertDescription>{passkeyStore.error}</AlertDescription>
			</Alert>
		{/if}
		{#if passkeyStore.requiresSetup}
			<EmptyState
				icon={Shield}
				title="Secure Your Secrets"
				description="Create your first passkey to encrypt and protect API tokens and sensitive information."
			>
				{#snippet action()}
					<Button onclick={() => (showSetupModal = true)} class="bg-primary">
						<Plus class="mr-2 h-4 w-4" />
						Create Your First Passkey
					</Button>
				{/snippet}
			</EmptyState>
		{:else if passkeyStore.hasPasskeys}
			<div class="space-y-3">
				<div class="flex items-center justify-between">
					<h3 class="text-sm font-medium">Your Passkeys</h3>
					<Button size="sm" variant="outline" onclick={() => (showSetupModal = true)}>
						<Plus class="mr-2 h-4 w-4" />
						Add Passkey
					</Button>
				</div>

				{#if passkeyStore.loading && passkeyStore.passkeys.length === 0}
					<LoadingRow text="Loading passkeys..." />
				{:else}
					<div class="space-y-2">
						{#each passkeyStore.passkeys as passkey (passkey.id)}
							<div class="flex items-center justify-between rounded-lg border p-3">
								<div class="flex-1">
									<div class="flex items-center space-x-2">
										<Key class="text-primary h-4 w-4" />
										<span class="text-sm font-medium">{passkey.name}</span>
									</div>
									<p class="text-muted-foreground mt-1 text-xs">
										Created {formatDateTime(passkey.createdAt)}
									</p>
								</div>
								<Button
									size="sm"
									variant="destructive"
									disabled={deletingPasskey === passkey.id}
									onclick={() => handleDeletePasskey(passkey)}
								>
									{#if deletingPasskey === passkey.id}
										<Loader2 class="mr-2 h-3 w-3 animate-spin" />
									{:else}
										<Trash2 class="mr-2 h-3 w-3" />
									{/if}
									Delete
								</Button>
							</div>
						{/each}
					</div>
				{/if}

				<Alert variant="info" role="note">
					<Info />
					<AlertTitle>Security Note</AlertTitle>
					<AlertDescription>
						Each passkey provides unique device-based encryption. Only devices with registered
						passkeys can unlock your secrets.
					</AlertDescription>
				</Alert>
			</div>
		{/if}
	</CardContent>
</Card>

<!-- Modals -->
<PasskeySetupModal
	bind:open={showSetupModal}
	onsuccess={handleSetupSuccess}
	oncancel={() => (showSetupModal = false)}
/>
