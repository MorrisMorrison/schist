<script lang="ts">
	import { onMount } from 'svelte';
	import { secretStore } from '$lib/stores/secrets.svelte';
	import { authStore } from '$lib/stores/auth.svelte';
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
	import InfoBox from '$lib/components/ui/info-box.svelte';
	import ToggleSlider from '$lib/components/ui/toggle-slider/ToggleSlider.svelte';
	import { Key, Lock, Copy, Edit, Trash2, Loader2, Plus } from 'lucide-svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';

	let showUnlockModal = $state(false);
	let showCreateModal = $state(false);
	let showEditModal = $state(false);
	let editingSecretKey = $state<string | null>(null);
	let deletingSecret = $state<string | null>(null);
	let reloadingAfterUnlock = $state(false);

	onMount(async () => {
		await secretStore.loadStatus();
		// If secrets are already unlocked but we don't have the list, load it
		if (secretStore.secretsUnlocked && secretStore.secrets.length === 0) {
			await secretStore.loadSecrets();
		}
	});

	$effect(() => {
		if (authStore.token && authStore.user) {
			secretStore.loadStatus().then(() => {
				// If secrets are already unlocked but we don't have the list, load it
				if (secretStore.secretsUnlocked && secretStore.secrets.length === 0) {
					secretStore.loadSecrets();
				}
			});
		}
	});

	async function handleUnlock() {
		showUnlockModal = true;
	}

	async function handleLock() {
		try {
			await secretStore.lock();
		} catch (error) {
			console.error('Failed to lock secrets:', error);
		}
	}

	function handleToggleUnlock(checked: boolean) {
		if (checked) {
			handleUnlock();
		} else {
			handleLock();
		}
	}

	async function handleUnlockSuccess() {
		showUnlockModal = false;

		if (reloadingAfterUnlock) return;
		reloadingAfterUnlock = true;

		try {
			await secretStore.loadStatus();
			if (secretStore.secretsUnlocked && secretStore.secrets.length === 0) {
				await secretStore.loadSecrets();
			}
		} catch (error) {
			console.warn('Failed to reload secrets after unlock:', error);
		} finally {
			reloadingAfterUnlock = false;
		}

		if (!secretStore.hasSecrets) {
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
		} catch (error) {
			console.error('Failed to delete secret:', error);
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
		{#if secretStore.error}
			<Alert variant="destructive">
				<AlertDescription>{secretStore.error}</AlertDescription>
			</Alert>
		{/if}

		<!-- Status Section -->
		<div class="bg-muted/50 flex items-center justify-between rounded-lg p-3">
			<div class="flex items-center space-x-2">
				{#if secretStore.secretsUnlocked}
					<div class="h-2 w-2 rounded-full bg-green-500"></div>
					<span class="text-primary text-sm font-medium"> Secrets Unlocked </span>
				{:else if secretStore.hasSecrets || secretStore.requiresPassword}
					<div class="h-2 w-2 rounded-full bg-amber-500"></div>
					<span class="text-muted-foreground text-sm font-medium"> Secrets Locked </span>
				{:else}
					<div class="h-2 w-2 rounded-full bg-gray-400"></div>
					<span class="text-muted-foreground text-sm font-medium"> No Secrets </span>
				{/if}
			</div>

			<div class="flex items-center space-x-2">
				{#if secretStore.secretsUnlocked}
					<Button size="sm" onclick={() => (showCreateModal = true)}>
						<Plus class="mr-1 h-3 w-3" />
						Add Secret
					</Button>
				{/if}
				<ToggleSlider
					checked={secretStore.secretsUnlocked}
					onCheckedChange={handleToggleUnlock}
					size="sm"
				/>
			</div>
		</div>

		<!-- Initial Setup Section -->
		{#if !secretStore.hasSecrets && !secretStore.requiresPassword && !secretStore.secretsUnlocked}
			<div class="space-y-4 py-8 text-center">
				<div class="bg-muted mx-auto flex h-16 w-16 items-center justify-center rounded-full">
					<Key class="text-muted-foreground h-8 w-8" />
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
						<Plus class="mr-2 h-4 w-4" />
						Set Up Passkey & Create First Secret
					</Button>
					<p class="text-muted-foreground text-xs">
						You'll set up a passkey to encrypt your secrets, then add your first secret.
					</p>
				</div>
			</div>

			<!-- Secret List Section -->
		{:else if secretStore.secretsUnlocked && secretStore.secrets.length > 0}
			<div class="space-y-3">
				<div class="flex items-center justify-between">
					<h3 class="text-sm font-medium">Your Secrets ({secretStore.secrets.length})</h3>
				</div>

				{#if secretStore.loading && secretStore.secrets.length === 0}
					<div class="flex items-center justify-center py-6">
						<LoadingSpinner size="md" />
						<span class="text-muted-foreground ml-2 text-sm">Loading secrets...</span>
					</div>
				{:else}
					<div class="space-y-2">
						{#each secretStore.secrets as secret (secret.key)}
							<div class="flex items-center justify-between rounded-lg border p-3">
								<div class="flex-1">
									<div class="flex items-center space-x-2">
										<Key class="text-primary h-4 w-4" />
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
										<Copy class="h-3 w-3" />
									</Button>
									<Button
										size="sm"
										variant="outline"
										onclick={() => startEdit(secret.key)}
										disabled={deletingSecret === secret.key}
									>
										<Edit class="mr-1 h-3 w-3" />
										Edit
									</Button>
									<Button
										size="sm"
										variant="destructive"
										disabled={deletingSecret === secret.key}
										onclick={() => handleDeleteSecret(secret.key)}
									>
										{#if deletingSecret === secret.key}
											<Loader2 class="mr-1 h-3 w-3 animate-spin" />
										{:else}
											<Trash2 class="mr-1 h-3 w-3" />
										{/if}
										Delete
									</Button>
								</div>
							</div>
						{/each}
					</div>
				{/if}

				<InfoBox
					title="Usage"
					description="Reference secrets in your documents using the placeholder syntax. When viewing documents with unlocked secrets, the placeholders will be replaced with the actual values."
				/>
			</div>

			<!-- Locked State -->
		{:else if (secretStore.hasSecrets || secretStore.requiresPassword) && !secretStore.secretsUnlocked}
			<div class="space-y-4 py-6 text-center">
				<div class="bg-muted mx-auto flex h-16 w-16 items-center justify-center rounded-full">
					<Lock class="text-muted-foreground h-8 w-8" />
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
