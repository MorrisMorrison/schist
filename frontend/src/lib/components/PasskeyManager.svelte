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
			// Error handled by store
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

		<!-- Setup Section -->
		{#if $requiresSetup}
			<div class="space-y-4 py-8 text-center">
				<div class="bg-muted mx-auto flex h-16 w-16 items-center justify-center rounded-full">
					<svg
						class="text-muted-foreground h-8 w-8"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 15v2m0 0v2m0-2h2m-2 0h-2m-5-4h10l2-5H7l-2 5zm0 0l-2-5m0 0l-2 5m2-5a2 2 0 114 0H9z"
						/>
					</svg>
				</div>
				<div>
					<h3 class="text-lg font-medium">Secure Your Secrets</h3>
					<p class="text-muted-foreground mt-1 text-sm">
						Create your first passkey to encrypt and protect API tokens and sensitive information.
					</p>
				</div>
				<Button onclick={() => (showSetupModal = true)} class="bg-primary">
					Create Your First Passkey
				</Button>
			</div>

			<!-- Passkey List Section -->
		{:else if $hasPasskeys}
			<div class="space-y-3">
				<div class="flex items-center justify-between">
					<h3 class="text-sm font-medium">Your Passkeys</h3>
					<Button size="sm" variant="outline" onclick={() => (showSetupModal = true)}>
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
										<svg
											class="text-primary h-4 w-4"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-3a1 1 0 011-1h2.586l6.414-6.414z"
											/>
										</svg>
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
										<div class="h-3 w-3 animate-spin rounded-full border-b border-current"></div>
									{:else}
										Delete
									{/if}
								</Button>
							</div>
						{/each}
					</div>
				{/if}

				<!-- Security Info -->
				<div
					class="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950/50"
				>
					<div class="flex">
						<svg
							class="mt-0.5 mr-2 h-4 w-4 flex-shrink-0 text-blue-600 dark:text-blue-400"
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
							<p class="text-sm font-medium text-blue-900 dark:text-blue-200">Security Note</p>
							<p class="mt-1 text-xs text-blue-700 dark:text-blue-300">
								Each passkey provides unique device-based encryption. Only devices with registered
								passkeys can unlock your secrets.
							</p>
						</div>
					</div>
				</div>
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
