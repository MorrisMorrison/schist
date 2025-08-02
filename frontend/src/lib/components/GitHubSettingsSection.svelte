<script lang="ts">
	import {
		githubActions,
		isGitHubLoading,
		githubError,
		githubSettings,
		githubStatus,
		connectionTest,
		isTestingConnection,
		isGitHubSyncing,
		lastSyncResult
	} from '$lib/stores/github';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Separator } from '$lib/components/ui/separator';
	import { AlertCircle, CheckCircle, Loader2, Settings, RefreshCw, Cloud } from 'lucide-svelte';
	import type { GitHubSetupRequest } from '$lib/api/types';
	import { onMount } from 'svelte';

	// GitHub form state
	let token = $state('');
	let owner = $state('');
	let repository = $state('');
	let branch = $state('main');
	let createRepository = $state(false);
	let private_repo = $state(true);
	let backupMode = $state<'manual' | 'auto'>('manual');
	let syncInterval = $state(60);
	let formError = $state('');

	// UI state
	let activeTab = $state<'setup' | 'status' | 'sync'>('setup');

	// Initialize form when component mounts or settings change
	$effect(() => {
		if ($githubSettings) {
			token = $githubSettings.config.token || '';
			owner = $githubSettings.config.owner || '';
			repository = $githubSettings.config.repository || '';
			branch = $githubSettings.config.branch || 'main';
			backupMode = $githubSettings.backupMode || 'manual';
			syncInterval = $githubSettings.syncInterval || 60;
		}
	});

	const isConnected = $derived($githubStatus?.connected ?? false);
	const canTest = $derived(token.trim() && owner.trim() && repository.trim());
	const hasChanges = $derived(
		$githubSettings
			? token !== $githubSettings.config.token ||
					owner !== $githubSettings.config.owner ||
					repository !== $githubSettings.config.repository ||
					branch !== $githubSettings.config.branch ||
					backupMode !== $githubSettings.backupMode ||
					syncInterval !== $githubSettings.syncInterval
			: canTest
	);

	onMount(() => {
		// Load GitHub data when component mounts
		githubActions.refresh();

		// Set initial tab based on connection status
		if ($githubStatus?.connected) {
			activeTab = 'status';
		}
	});

	function validateForm(): boolean {
		if (!token.trim()) {
			formError = 'GitHub token is required';
			return false;
		}
		if (!owner.trim()) {
			formError = 'Owner/organization is required';
			return false;
		}
		if (!repository.trim()) {
			formError = 'Repository name is required';
			return false;
		}
		if (!branch.trim()) {
			formError = 'Branch name is required';
			return false;
		}
		if (syncInterval < 5) {
			formError = 'Sync interval must be at least 5 minutes';
			return false;
		}

		formError = '';
		return true;
	}

	async function testConnection() {
		if (!validateForm()) return;

		try {
			await githubActions.testConnection(token.trim(), owner.trim(), repository.trim());
		} catch {
			// Error is handled by the store
		}
	}

	async function setupGitHub() {
		if (!validateForm()) return;

		try {
			const setupRequest: GitHubSetupRequest = {
				token: token.trim(),
				owner: owner.trim(),
				repository: repository.trim(),
				branch: branch.trim(),
				createRepository,
				private: private_repo
			};

			await githubActions.setupGitHub(setupRequest);

			// Update settings with backup mode and sync interval
			await githubActions.updateSettings({
				backupMode,
				syncInterval
			});

			activeTab = 'status';
		} catch {
			// Error is handled by the store
		}
	}

	async function updateSettings() {
		if (!validateForm()) return;

		try {
			await githubActions.updateSettings({
				config: {
					token: token.trim(),
					owner: owner.trim(),
					repository: repository.trim(),
					branch: branch.trim()
				},
				backupMode,
				syncInterval
			});
		} catch {
			// Error is handled by the store
		}
	}

	async function syncNow() {
		try {
			await githubActions.syncToGitHub();
		} catch {
			// Error is handled by the store
		}
	}

	async function disconnect() {
		try {
			await githubActions.disconnect();
			activeTab = 'setup';
		} catch {
			// Error is handled by the store
		}
	}

	function formatLastSync(timestamp?: string): string {
		if (!timestamp) return 'Never';
		const date = new Date(timestamp);
		return date.toLocaleString();
	}

	function clearErrors() {
		formError = '';
		githubActions.clearError();
		githubActions.clearConnectionTest();
	}
</script>

<div class="space-y-6">
	<!-- Tab Navigation -->
	<div class="flex border-b border-gray-200 dark:border-gray-700">
		<button
			type="button"
			onclick={() => {
				activeTab = 'setup';
				clearErrors();
			}}
			class="border-b-2 px-4 py-2 text-sm font-medium transition-colors {activeTab === 'setup'
				? 'border-blue-500 text-blue-600 dark:text-blue-400'
				: 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}"
		>
			<Settings class="mr-1 inline h-4 w-4" />
			Setup
		</button>
		<button
			type="button"
			onclick={() => (activeTab = 'status')}
			class="border-b-2 px-4 py-2 text-sm font-medium transition-colors {activeTab === 'status'
				? 'border-blue-500 text-blue-600 dark:text-blue-400'
				: 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}"
			disabled={!isConnected}
		>
			<Cloud class="mr-1 inline h-4 w-4" />
			Status
		</button>
		<button
			type="button"
			onclick={() => (activeTab = 'sync')}
			class="border-b-2 px-4 py-2 text-sm font-medium transition-colors {activeTab === 'sync'
				? 'border-blue-500 text-blue-600 dark:text-blue-400'
				: 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}"
			disabled={!isConnected}
		>
			<RefreshCw class="mr-1 inline h-4 w-4" />
			Sync
		</button>
	</div>

	<!-- Setup Tab -->
	{#if activeTab === 'setup'}
		<form
			class="space-y-6"
			onsubmit={(e) => {
				e.preventDefault();
				if (isConnected) {
					updateSettings();
				} else {
					setupGitHub();
				}
			}}
		>
			<div class="space-y-4">
				<div class="space-y-2">
					<Label for="github-token">GitHub Personal Access Token</Label>
					<Input
						id="github-token"
						type="password"
						bind:value={token}
						placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
						required
					/>
					<p class="text-sm text-gray-600 dark:text-gray-400">
						Create a token at <a
							href="https://github.com/settings/tokens"
							target="_blank"
							class="text-blue-600 hover:underline">GitHub Settings</a
						> with repo permissions.
					</p>
				</div>

				<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
					<div class="space-y-2">
						<Label for="github-owner">Owner/Organization</Label>
						<Input id="github-owner" bind:value={owner} placeholder="username or org" required />
					</div>

					<div class="space-y-2">
						<Label for="github-repository">Repository Name</Label>
						<Input
							id="github-repository"
							bind:value={repository}
							placeholder="my-documents"
							required
						/>
					</div>
				</div>

				<div class="space-y-2">
					<Label for="github-branch">Branch</Label>
					<Input id="github-branch" bind:value={branch} placeholder="main" required />
				</div>

				{#if !isConnected}
					<div class="space-y-3">
						<label class="flex items-center space-x-2">
							<input type="checkbox" bind:checked={createRepository} class="rounded" />
							<span class="text-sm">Create repository if it doesn't exist</span>
						</label>

						{#if createRepository}
							<label class="ml-6 flex items-center space-x-2">
								<input type="checkbox" bind:checked={private_repo} class="rounded" />
								<span class="text-sm">Make repository private</span>
							</label>
						{/if}
					</div>
				{/if}

				<Separator />

				<div class="space-y-4">
					<h3 class="text-lg font-medium">Backup Settings</h3>

					<div class="space-y-2">
						<Label for="backup-mode">Backup Mode</Label>
						<select
							bind:value={backupMode}
							class="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800"
						>
							<option value="manual">Manual</option>
							<option value="auto">Automatic</option>
						</select>
					</div>

					{#if backupMode === 'auto'}
						<div class="space-y-2">
							<Label for="sync-interval">Sync Interval (minutes)</Label>
							<Input
								id="sync-interval"
								type="number"
								bind:value={syncInterval}
								min="5"
								max="1440"
							/>
						</div>
					{/if}
				</div>
			</div>

			{#if formError || $githubError}
				<div
					class="flex items-center gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/50 dark:text-red-300"
				>
					<AlertCircle class="h-4 w-4 flex-shrink-0" />
					{formError || $githubError}
				</div>
			{/if}

			{#if $connectionTest}
				<div
					class="flex items-center gap-2 rounded-md p-3 text-sm {$connectionTest.success
						? 'bg-green-50 text-green-700 dark:bg-green-900/50 dark:text-green-300'
						: 'bg-red-50 text-red-700 dark:bg-red-900/50 dark:text-red-300'}"
				>
					{#if $connectionTest.success}
						<CheckCircle class="h-4 w-4 flex-shrink-0" />
					{:else}
						<AlertCircle class="h-4 w-4 flex-shrink-0" />
					{/if}
					{$connectionTest.message}
				</div>
			{/if}

			<div class="flex flex-col justify-between gap-4 sm:flex-row">
				<div class="space-x-2">
					<Button
						type="button"
						variant="outline"
						onclick={testConnection}
						disabled={!canTest || $isTestingConnection}
					>
						{#if $isTestingConnection}
							<Loader2 class="mr-2 h-4 w-4 animate-spin" />
						{/if}
						Test Connection
					</Button>
				</div>

				<div class="space-x-2">
					{#if isConnected}
						<Button
							type="button"
							variant="outline"
							onclick={disconnect}
							disabled={$isGitHubLoading}
						>
							Disconnect
						</Button>
					{/if}
					<Button type="submit" disabled={!canTest || !hasChanges || $isGitHubLoading}>
						{#if $isGitHubLoading}
							<Loader2 class="mr-2 h-4 w-4 animate-spin" />
						{/if}
						{isConnected ? 'Update Settings' : 'Setup GitHub'}
					</Button>
				</div>
			</div>
		</form>
	{/if}

	<!-- Status Tab -->
	{#if activeTab === 'status'}
		<div class="space-y-4">
			<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
				<div class="space-y-2">
					<span class="text-sm font-medium text-gray-600 dark:text-gray-400">Connection Status</span
					>
					<div class="flex items-center gap-2">
						{#if $githubStatus?.connected}
							<CheckCircle class="h-4 w-4 text-green-500" />
							<span class="text-green-600 dark:text-green-400">Connected</span>
						{:else}
							<AlertCircle class="h-4 w-4 text-red-500" />
							<span class="text-red-600 dark:text-red-400">Disconnected</span>
						{/if}
					</div>
				</div>

				<div class="space-y-2">
					<span class="text-sm font-medium text-gray-600 dark:text-gray-400">Last Sync</span>
					<div class="text-sm">{formatLastSync($githubStatus?.lastSync)}</div>
				</div>
			</div>

			{#if $githubStatus?.repositoryUrl}
				<div class="space-y-2">
					<span class="text-sm font-medium text-gray-600 dark:text-gray-400">Repository</span>
					<a
						href={$githubStatus.repositoryUrl}
						target="_blank"
						class="text-blue-600 hover:underline dark:text-blue-400"
					>
						{$githubStatus.repositoryUrl}
					</a>
				</div>
			{/if}

			{#if $githubSettings}
				<div class="space-y-2">
					<span class="text-sm font-medium text-gray-600 dark:text-gray-400">Backup Mode</span>
					<div class="text-sm capitalize">{$githubSettings.backupMode}</div>
				</div>

				{#if $githubSettings.backupMode === 'auto'}
					<div class="space-y-2">
						<span class="text-sm font-medium text-gray-600 dark:text-gray-400">Sync Interval</span>
						<div class="text-sm">{$githubSettings.syncInterval} minutes</div>
					</div>
				{/if}
			{/if}

			{#if $githubStatus?.error}
				<div
					class="flex items-center gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/50 dark:text-red-300"
				>
					<AlertCircle class="h-4 w-4 flex-shrink-0" />
					{$githubStatus.error}
				</div>
			{/if}
		</div>
	{/if}

	<!-- Sync Tab -->
	{#if activeTab === 'sync'}
		<div class="space-y-4">
			<div class="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
				<h3 class="text-lg font-medium">Manual Sync</h3>
				<Button onclick={syncNow} disabled={!isConnected || $isGitHubSyncing}>
					{#if $isGitHubSyncing}
						<Loader2 class="mr-2 h-4 w-4 animate-spin" />
						Syncing...
					{:else}
						<RefreshCw class="mr-2 h-4 w-4" />
						Sync Now
					{/if}
				</Button>
			</div>

			{#if $lastSyncResult}
				<div class="space-y-2 rounded-lg border p-4">
					<div class="flex items-center gap-2">
						{#if $lastSyncResult.success}
							<CheckCircle class="h-4 w-4 text-green-500" />
							<span class="font-medium text-green-600 dark:text-green-400"
								>Last Sync Successful</span
							>
						{:else}
							<AlertCircle class="h-4 w-4 text-red-500" />
							<span class="font-medium text-red-600 dark:text-red-400">Last Sync Failed</span>
						{/if}
					</div>

					<div class="text-sm text-gray-600 dark:text-gray-400">
						{formatLastSync($lastSyncResult.timestamp)}
					</div>

					<div class="text-sm">{$lastSyncResult.message}</div>

					{#if $lastSyncResult.syncedFiles !== undefined}
						<div class="text-sm text-gray-600 dark:text-gray-400">
							Files synced: {$lastSyncResult.syncedFiles}
						</div>
					{/if}

					{#if $lastSyncResult.errors && $lastSyncResult.errors.length > 0}
						<div class="space-y-1">
							<div class="text-sm font-medium text-red-600 dark:text-red-400">Errors:</div>
							{#each $lastSyncResult.errors as error, index (index)}
								<div class="text-sm text-red-600 dark:text-red-400">• {error}</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

			<div class="text-sm text-gray-600 dark:text-gray-400">
				<p>
					Manual sync will immediately push all your documents to the configured GitHub repository.
				</p>
				<p class="mt-2">
					This operation may take a few moments depending on the number of documents.
				</p>
			</div>
		</div>
	{/if}
</div>
