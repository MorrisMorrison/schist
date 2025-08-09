<script lang="ts">
	import { onMount } from 'svelte';
	import {
		secretStore,
		secretList,
		secretsError,
		secretsLoading,
		secretsUnlocked,
		hasSecrets,
		requiresPassword
	} from '$lib/stores/secrets';
	import { authStore } from '$lib/stores/auth';
	import { Button } from '$lib/components/ui/button';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import PasskeyUnlockModal from './modal/PasskeyUnlockModal.svelte';
	import SecretEditModal from './modal/SecretEditModal.svelte';

	let showUnlockModal = $state(false);
	let showCreateModal = $state(false);
	let showEditModal = $state(false);
	let editingSecretKey = $state<string | null>(null);
	let deletingSecret = $state<string | null>(null);
	let reloadingAfterUnlock = $state(false);

	onMount(() => {
		// Only load status on mount, let other effects handle loading secrets
		secretStore.loadStatus();
	});

	// React to authentication changes - only reload status, not secrets
	$effect(() => {
		if ($authStore.token && $authStore.user) {
			secretStore.loadStatus();
		}
	});

	async function handleUnlock() {
		showUnlockModal = true;
	}

	async function handleLock() {
		try {
			await secretStore.lock();
		} catch {
			// Error handled by store
		}
	}

	async function handleUnlockSuccess() {
		showUnlockModal = false;

		// Prevent multiple simultaneous reloads
		if (reloadingAfterUnlock) return;
		reloadingAfterUnlock = true;

		try {
			await secretStore.loadStatus();
			// Only load secrets if status confirms unlocked and we don't have them yet
			if ($secretsUnlocked && $secretList.length === 0) {
				await secretStore.loadSecrets();
			}
		} catch (error) {
			console.warn('Failed to reload secrets after unlock:', error);
		} finally {
			reloadingAfterUnlock = false;
		}

		// If this was first-time setup, automatically open create modal
		if (!$hasSecrets) {
			setTimeout(() => {
				showCreateModal = true;
			}, 300);
		}
	}

	function handleCreateSuccess() {
		showCreateModal = false;
	}

	function handleEditSuccess() {
		showEditModal = false;
		editingSecretKey = null;
	}

	function startEdit(secretKey: string) {
		editingSecretKey = secretKey;
		showEditModal = true;
	}

	async function handleDeleteSecret(secretKey: string) {
		if (!confirm(`Delete secret "${secretKey}"? This cannot be undone.`)) {
			return;
		}

		deletingSecret = secretKey;

		try {
			await secretStore.deleteSecret(secretKey);
		} catch {
			// Error handled by store
		} finally {
			deletingSecret = null;
		}
	}

	async function copySecretReference(secretKey: string) {
		const reference = `{{secret:${secretKey}}}`;
		await navigator.clipboard.writeText(reference);
	}
</script>

<Card>
	<CardHeader>
		<CardTitle>Secret Management</CardTitle>
		<CardDescription>
			Manage encrypted secrets that can be referenced in your documents using placeholder syntax.
		</CardDescription>
	</CardHeader>

	<CardContent class="space-y-4">
		{#if $secretsError}
			<Alert variant="destructive">
				<AlertDescription>{$secretsError}</AlertDescription>
			</Alert>
		{/if}

		<!-- Status Section -->
		<div class="bg-muted/50 flex items-center justify-between rounded-lg p-3">
			<div class="flex items-center space-x-2">
				{#if $secretsUnlocked}
					<div class="h-2 w-2 rounded-full bg-green-500"></div>
					<span class="text-sm font-medium text-green-700 dark:text-green-400">
						Secrets Unlocked
					</span>
				{:else if $hasSecrets || $requiresPassword}
					<div class="h-2 w-2 rounded-full bg-amber-500"></div>
					<span class="text-sm font-medium text-amber-700 dark:text-amber-400">
						Secrets Locked
					</span>
				{:else}
					<div class="h-2 w-2 rounded-full bg-gray-400"></div>
					<span class="text-muted-foreground text-sm font-medium"> No Secrets </span>
				{/if}
			</div>

			<div class="flex items-center space-x-2">
				{#if $secretsUnlocked}
					<Button size="sm" variant="outline" onclick={handleLock}>Lock</Button>
					<Button size="sm" onclick={() => (showCreateModal = true)}>Add Secret</Button>
				{:else}
					<Button size="sm" onclick={handleUnlock}>Unlock to Manage</Button>
				{/if}
			</div>
		</div>

		<!-- Initial Setup Section -->
		{#if !$hasSecrets && !$requiresPassword && !$secretsUnlocked}
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
							d="M12 15v2m-2 0h2m0 0h2m-2 0v2m-2-2h2m-2-4h2m0 0V9a2 2 0 00-2-2H9a2 2 0 00-2 2v2h2"
						/>
					</svg>
				</div>
				<div>
					<h3 class="text-lg font-medium">Secure Your API Keys & Secrets</h3>
					<p class="text-muted-foreground mt-1 text-sm">
						Store API keys, passwords, and other sensitive information encrypted and reference them
						in your documents.
					</p>
				</div>
				<div class="space-y-2">
					<Button onclick={handleUnlock} class="bg-primary">
						Set Up Passkey & Create First Secret
					</Button>
					<p class="text-muted-foreground text-xs">
						You'll set up a passkey to encrypt your secrets, then add your first secret.
					</p>
				</div>
			</div>

			<!-- Secret List Section -->
		{:else if $secretsUnlocked && $secretList.length > 0}
			<div class="space-y-3">
				<div class="flex items-center justify-between">
					<h3 class="text-sm font-medium">Your Secrets ({$secretList.length})</h3>
				</div>

				{#if $secretsLoading && $secretList.length === 0}
					<div class="flex items-center justify-center py-6">
						<div class="border-primary h-6 w-6 animate-spin rounded-full border-b-2"></div>
						<span class="text-muted-foreground ml-2 text-sm">Loading secrets...</span>
					</div>
				{:else}
					<div class="space-y-2">
						{#each $secretList as secret (secret.key)}
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
										<code class="font-mono text-sm font-medium">{secret.key}</code>
									</div>
									<p class="text-muted-foreground mt-1 font-mono text-xs">
										{'{{secret:' + secret.key + '}}'}
									</p>
								</div>
								<div class="flex items-center space-x-1">
									<Button
										size="sm"
										variant="ghost"
										onclick={() => copySecretReference(secret.key)}
										title="Copy reference"
									>
										<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
											/>
										</svg>
									</Button>
									<Button
										size="sm"
										variant="outline"
										onclick={() => startEdit(secret.key)}
										disabled={deletingSecret === secret.key}
									>
										Edit
									</Button>
									<Button
										size="sm"
										variant="destructive"
										disabled={deletingSecret === secret.key}
										onclick={() => handleDeleteSecret(secret.key)}
									>
										{#if deletingSecret === secret.key}
											<div class="h-3 w-3 animate-spin rounded-full border-b border-current"></div>
										{:else}
											Delete
										{/if}
									</Button>
								</div>
							</div>
						{/each}
					</div>
				{/if}

				<!-- Usage Info -->
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
							<p class="text-sm font-medium text-blue-900 dark:text-blue-200">Usage</p>
							<p class="mt-1 text-xs text-blue-700 dark:text-blue-300">
								Reference secrets in your documents using the placeholder syntax. When viewing
								documents with unlocked secrets, the placeholders will be replaced with the actual
								values.
							</p>
						</div>
					</div>
				</div>
			</div>

			<!-- Locked State -->
		{:else if ($hasSecrets || $requiresPassword) && !$secretsUnlocked}
			<div class="space-y-4 py-6 text-center">
				<div
					class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900"
				>
					<svg
						class="h-8 w-8 text-amber-600 dark:text-amber-400"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 15v2m-2 0h2m0 0h2m-2 0v2m-2-2h2m-2-4h2m0 0V9a2 2 0 00-2-2H9a2 2 0 00-2 2v2h2"
						/>
					</svg>
				</div>
				<div>
					<h3 class="text-lg font-medium">Secrets Locked</h3>
					<p class="text-muted-foreground mt-1 text-sm">
						Your secrets are encrypted and locked. Use your passkey to manage them.
					</p>
				</div>
				<Button onclick={handleUnlock}>Unlock Secrets</Button>
			</div>
		{/if}
	</CardContent>
</Card>

<!-- Modals -->
<PasskeyUnlockModal
	bind:open={showUnlockModal}
	title="Unlock Secrets with Passkey"
	description="Use your passkey to unlock your encrypted secrets and API keys."
	onsuccess={handleUnlockSuccess}
	oncancel={() => (showUnlockModal = false)}
/>

<SecretEditModal
	bind:open={showCreateModal}
	onsuccess={handleCreateSuccess}
	oncancel={() => (showCreateModal = false)}
/>

<SecretEditModal
	bind:open={showEditModal}
	secretKey={editingSecretKey || undefined}
	onsuccess={handleEditSuccess}
	oncancel={() => {
		showEditModal = false;
		editingSecretKey = null;
	}}
/>
