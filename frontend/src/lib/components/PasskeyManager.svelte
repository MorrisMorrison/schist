<script lang="ts">
	import { onMount } from 'svelte';
	import {
		passkeyStore,
		passkeyList,
		passkeyError,
		passkeyLoading,
		hasPasskeys,
		requiresSetup
	} from '$lib/stores/passkeys';
	import { Button } from '$lib/components/ui/button';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import PasskeySetupModal from './modal/PasskeySetupModal.svelte';
	import InfoBox from '$lib/components/ui/info-box.svelte';
	import { Shield, Key, Plus, Trash2, Loader2 } from 'lucide-svelte';

	let showSetupModal = false;
	let deletingPasskey: string | null = null;

	onMount(() => {
		passkeyStore.loadStatus();
		passkeyStore.loadPasskeys();
	});

	async function handleDeletePasskey(passkey: { id: string; name: string }) {
		if (!confirm(`Delete passkey "${passkey.name}"? This cannot be undone.`)) {
			return;
		}

		deletingPasskey = passkey.id;

		try {
			await passkeyStore.deletePasskey(passkey.id);
		} catch {
			deletingPasskey = null;
		} finally {
			deletingPasskey = null;
		}
	}

	function formatDate(dateString: string): string {
		return new Date(dateString).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function handleSetupSuccess() {
		showSetupModal = false;

		passkeyStore.loadStatus();
		passkeyStore.loadPasskeys();
	}
</script>

<Card>
	<CardHeader>
		<CardTitle>Passkey Security</CardTitle>
		<CardDescription>Manage your authentication passkeys.</CardDescription>
	</CardHeader>

	<CardContent class="space-y-4">
		{#if $passkeyError}
			<Alert variant="destructive">
				<AlertDescription>{$passkeyError}</AlertDescription>
			</Alert>
		{/if}
		{#if $requiresSetup}
			<div class="space-y-4 py-8 text-center">
				<div class="bg-muted mx-auto flex h-16 w-16 items-center justify-center rounded-full">
					<Shield class="text-muted-foreground h-8 w-8" />
				</div>
				<div>
					<h3 class="text-lg font-medium">Secure Your Secrets</h3>
					<p class="text-muted-foreground mt-1 text-sm">
						Create your first passkey to encrypt and protect API tokens and sensitive information.
					</p>
				</div>
				<Button onclick={() => (showSetupModal = true)} class="bg-primary">
					<Plus class="mr-2 h-4 w-4" />
					Create Your First Passkey
				</Button>
			</div>
		{:else if $hasPasskeys}
			<div class="space-y-3">
				<div class="flex items-center justify-between">
					<h3 class="text-sm font-medium">Your Passkeys</h3>
					<Button size="sm" variant="outline" onclick={() => (showSetupModal = true)}>
						<Plus class="mr-2 h-4 w-4" />
						Add Passkey
					</Button>
				</div>

				{#if $passkeyLoading && $passkeyList.length === 0}
					<div class="flex items-center justify-center py-6">
						<div class="border-primary h-6 w-6 animate-spin rounded-full border-b-2"></div>
						<span class="text-muted-foreground ml-2 text-sm">Loading passkeys...</span>
					</div>
				{:else}
					<div class="space-y-2">
						{#each $passkeyList as passkey (passkey.id)}
							<div class="flex items-center justify-between rounded-lg border p-3">
								<div class="flex-1">
									<div class="flex items-center space-x-2">
										<Key class="text-primary h-4 w-4" />
										<span class="text-sm font-medium">{passkey.name}</span>
									</div>
									<p class="text-muted-foreground mt-1 text-xs">
										Created {formatDate(passkey.createdAt)}
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

				<InfoBox
					title="Security Note"
					description="Each passkey provides unique device-based encryption. Only devices with registered passkeys can unlock your secrets."
				/>
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
