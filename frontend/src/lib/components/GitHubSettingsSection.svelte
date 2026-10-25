<script lang="ts">
	import { githubActions, githubStore } from '$lib/stores/github.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Separator } from '$lib/components/ui/separator';
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import { AlertCircle, CheckCircle, Loader2, Settings, RefreshCw } from '@lucide/svelte';
	import type { GitHubSetupRequest } from '$lib/api/types';
	import { onMount } from 'svelte';

	let token = $state('');
	let owner = $state('');
	let repository = $state('');
	let branch = $state('main');
	let createRepository = $state(false);
	let private_repo = $state(true);
	let backupMode = $state<'manual' | 'auto'>('manual');
	let syncInterval = $state(60);
	let formError = $state('');
	let tokenChanged = $state(false);

	let activeTab = $state<'setup' | 'sync'>('setup');

	$effect(() => {
		if (
			githubStore.connectionStatus &&
			githubStore.connectionStatus.connected &&
			githubStore.settings
		) {
			token = '';

			owner = githubStore.settings.owner || '';
			repository = githubStore.settings.repository || '';
			branch = githubStore.settings.branch || 'main';
			backupMode = githubStore.settings.auto_sync ? 'auto' : 'manual';
			syncInterval = 60;
			tokenChanged = false;
		}
	});

	const isConnected = $derived(githubStore.connectionStatus?.connected ?? false);
	const canTestConnection = $derived(token.trim() && owner.trim() && repository.trim());
	const hasChanges = $derived(
		githubStore.connectionStatus && githubStore.connectionStatus.connected && githubStore.settings
			? branch !== githubStore.settings.branch ||
					(backupMode === 'auto') !== githubStore.settings.auto_sync
			: canTestConnection
	);

	onMount(() => {
		if (!githubStore.settings && !githubStore.connectionStatus) {
			githubActions.refresh();
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

		return validateSettingsUpdate();
	}

	function validateSettingsUpdate(): boolean {
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
			console.error('Error testing connection');
		}
	}

	async function setupGitHub() {
		if (!validateForm()) return;

		try {
			const tokenToUse = tokenChanged ? token.trim() : ''; // Token is not accessible from settings (stored securely)

			const setupRequest: GitHubSetupRequest = {
				token: tokenToUse,
				owner: owner.trim(),
				repo: repository.trim(),
				branch: branch.trim(),
				auto_sync: backupMode === 'auto',
				sync_on_save: false
			};

			await githubActions.setupGitHub(setupRequest);
		} catch {
			console.error('Error setting up github');
		}
	}

	async function updateSettings() {
		if (!validateSettingsUpdate()) return;
		try {
			await githubActions.updateSettings({
				auto_sync: backupMode === 'auto',
				branch: branch.trim()
			});
		} catch {
			console.error('Error updating github settings');
		}
	}

	async function syncNow() {
		try {
			await githubActions.syncToGitHub();
		} catch {
			console.error('Error syncing with github');
		}
	}

	async function disconnect() {
		try {
			await githubActions.disconnect();
			activeTab = 'setup';
		} catch {
			console.error('Error disconnecting from github');
		}
	}

	function formatLastSync(timestamp?: string): string {
		if (!timestamp) return 'Never';

		const date = new Date(timestamp);

		if (isNaN(date.getTime()) || date.getFullYear() <= 1970) {
			return 'Never';
		}

		return date.toLocaleString();
	}

	function clearErrors() {
		formError = '';
		githubActions.clearError();
		githubActions.clearConnectionTest();
		githubActions.clearHealthStatus();
	}

	async function checkGitHealth() {
		try {
			await githubActions.checkGitHealth();
		} catch {
			console.error('Error checking Git repository health');
		}
	}

	async function repairRepository() {
		try {
			await githubActions.repairRepository();
		} catch {
			console.error('Error repairing Git repository');
		}
	}

	const notConnectedMessage =
		'GitHub is not connected. Please complete the setup in the "Setup" tab before syncing.';
</script>

<div class="space-y-6">
	<div class="border-border flex border-b">
		<button
			type="button"
			data-testid="github-setup-tab"
			onclick={() => {
				activeTab = 'setup';
				clearErrors();
			}}
			class="border-b-2 px-4 py-2 text-sm font-medium transition-colors {activeTab === 'setup'
				? 'border-primary text-primary'
				: 'text-muted-foreground hover:text-foreground border-transparent'}"
		>
			<Settings class="mr-1 inline h-4 w-4" />
			Setup
		</button>
		<button
			type="button"
			data-testid="github-sync-tab"
			onclick={() => (activeTab = 'sync')}
			class="border-b-2 px-4 py-2 text-sm font-medium transition-colors {activeTab === 'sync'
				? 'border-primary text-primary'
				: 'text-muted-foreground hover:text-foreground border-transparent'} {!isConnected
				? 'cursor-not-allowed opacity-50'
				: 'cursor-pointer'}"
			disabled={!isConnected}
		>
			<RefreshCw class="mr-1 inline h-4 w-4" />
			Sync
		</button>
	</div>

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
						data-testid="github-token-input"
						type="password"
						bind:value={token}
						placeholder="github_token_here"
						required={!isConnected}
						oninput={() => (tokenChanged = true)}
					/>
					<p class="text-muted-foreground text-sm">
						Create a token at <a
							href="https://github.com/settings/tokens"
							target="_blank"
							class="text-blue-600 hover:underline dark:text-blue-400">GitHub Settings</a
						> with repo permissions.
					</p>
				</div>

				<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
					<div class="space-y-2">
						<Label for="github-owner">Owner/Organization</Label>
						<Input
							id="github-owner"
							data-testid="github-owner-input"
							bind:value={owner}
							placeholder="username or org"
							required
						/>
					</div>

					<div class="space-y-2">
						<Label for="github-repository">Repository Name</Label>
						<Input
							id="github-repository"
							data-testid="github-repository-input"
							bind:value={repository}
							placeholder="my-documents"
							required
						/>
					</div>
				</div>

				<div class="space-y-2">
					<Label for="github-branch">Branch</Label>
					<Input
						id="github-branch"
						data-testid="github-branch-input"
						bind:value={branch}
						placeholder="main"
						required
					/>
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
							id="backup-mode"
							bind:value={backupMode}
							class="border-input bg-background w-full rounded-md border px-3 py-2"
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

			{#if formError || githubStore.error}
				<ErrorAlert error={formError || githubStore.error || ''} class="[&_span]:space-y-1" />
			{/if}

			{#if githubStore.connectionTest}
				<div
					data-testid="github-connection-test-result"
					class="flex items-center gap-2 rounded-md p-3 text-sm {githubStore.connectionTest.success
						? 'bg-accent/50 text-accent-foreground'
						: 'bg-destructive/10 text-destructive'}"
				>
					{#if githubStore.connectionTest.success}
						<CheckCircle class="h-4 w-4 flex-shrink-0" />
					{:else}
						<AlertCircle class="h-4 w-4 flex-shrink-0" />
					{/if}
					<span data-testid="github-connection-test-message"
						>{githubStore.connectionTest.message}</span
					>
				</div>
			{/if}

			{#if isConnected && githubStore.settings}
				<Separator />

				<div class="space-y-4">
					<h3 class="text-lg font-medium">Status</h3>

					<div class="grid grid-cols-1 gap-4 md:grid-cols-3">
						<div class="space-y-2">
							<Label>Connection Status</Label>
							<div class="flex items-center gap-2">
								{#if githubStore.connectionStatus?.connected}
									<CheckCircle class="h-4 w-4 text-green-500" />
									<span
										data-testid="github-status-connected"
										class="text-sm text-green-600 dark:text-green-400">Connected</span
									>
								{:else}
									<AlertCircle class="h-4 w-4 text-red-500" />
									<span data-testid="github-status-disconnected" class="text-destructive text-sm"
										>Disconnected</span
									>
								{/if}
							</div>
						</div>

						<div class="space-y-2">
							<Label>Last Sync</Label>
							<div class="text-foreground text-sm">
								{formatLastSync(githubStore.settings?.last_sync)}
							</div>
						</div>

						{#if githubStore.settings?.owner && githubStore.settings?.repository}
							<div class="space-y-2">
								<Label>Repository</Label>
								<div class="flex items-center">
									<a
										href="https://github.com/{githubStore.settings.owner}/{githubStore.settings
											.repository}"
										target="_blank"
										class="text-primary truncate text-sm hover:underline"
										title="https://github.com/{githubStore.settings.owner}/{githubStore.settings
											.repository}"
									>
										{githubStore.settings.owner}/{githubStore.settings.repository}
									</a>
								</div>
							</div>
						{/if}
					</div>

					{#if githubStore.settings?.last_sync_error}
						<ErrorAlert error={githubStore.settings.last_sync_error} />
					{/if}
				</div>
			{/if}

			<Separator />

			<div class="flex flex-col justify-between gap-4 sm:flex-row">
				<div class="space-x-2">
					<Button
						type="button"
						data-testid="github-test-connection-button"
						variant="outline"
						onclick={testConnection}
						disabled={!canTestConnection || githubStore.testingConnection}
					>
						{#if githubStore.testingConnection}
							<Loader2 class="mr-2 h-4 w-4 animate-spin" />
						{/if}
						Test Connection
					</Button>
				</div>

				<div class="space-x-2">
					{#if isConnected}
						<Button
							type="button"
							data-testid="github-disconnect-button"
							variant="outline"
							onclick={disconnect}
							disabled={githubStore.loading}
						>
							Disconnect
						</Button>
					{/if}
					<Button
						type="submit"
						data-testid="github-setup-button"
						disabled={isConnected
							? !hasChanges || githubStore.loading
							: !canTestConnection || !hasChanges || githubStore.loading}
					>
						{#if githubStore.loading}
							<Loader2 class="mr-2 h-4 w-4 animate-spin" />
						{/if}
						{isConnected ? 'Update Settings' : 'Setup GitHub'}
					</Button>
				</div>
			</div>
		</form>
	{/if}

	{#if activeTab === 'sync'}
		<div class="space-y-4">
			{#if !isConnected}
				<ErrorAlert variant="warning" error={notConnectedMessage} />
			{/if}

			{#if isConnected}
				<div class="space-y-4 rounded-lg border p-4">
					<div class="flex items-center justify-between">
						<h4 class="font-medium">Git Repository Health</h4>
						<div class="flex gap-2">
							<Button
								variant="outline"
								size="sm"
								onclick={checkGitHealth}
								disabled={githubStore.checkingHealth || githubStore.repairingRepository}
							>
								{#if githubStore.checkingHealth}
									<Loader2 class="mr-1 h-3 w-3 animate-spin" />
								{/if}
								Check Health
							</Button>
							{#if githubStore.gitHealthStatus && !githubStore.gitHealthStatus.healthy}
								<Button
									variant="outline"
									size="sm"
									onclick={repairRepository}
									disabled={githubStore.repairingRepository || githubStore.checkingHealth}
									class="border-orange-300 text-orange-600 hover:bg-orange-50"
								>
									{#if githubStore.repairingRepository}
										<Loader2 class="mr-1 h-3 w-3 animate-spin" />
									{/if}
									Repair
								</Button>
							{/if}
						</div>
					</div>

					{#if githubStore.gitHealthStatus}
						<div class="flex items-center gap-2">
							{#if githubStore.gitHealthStatus.healthy}
								<CheckCircle class="h-4 w-4 text-green-500" />
								<span class="text-sm text-green-600 dark:text-green-400">Repository is healthy</span
								>
							{:else}
								<AlertCircle class="h-4 w-4 text-red-500" />
								<span class="text-sm text-red-600 dark:text-red-400"
									>Repository health issues detected</span
								>
							{/if}
						</div>

						{#if !githubStore.gitHealthStatus.healthy && githubStore.gitHealthStatus.error}
							<ErrorAlert
								error={`Health Check Error: ${githubStore.gitHealthStatus.error}. 💡 Click the "Repair" button to attempt automatic repository repair.`}
							/>
						{/if}
					{/if}

					{#if githubStore.lastRepairResult}
						<div
							class="flex items-start gap-2 rounded-md p-3 text-sm {githubStore.lastRepairResult
								.success
								? 'border border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-400'
								: 'border border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400'}"
						>
							{#if githubStore.lastRepairResult.success}
								<CheckCircle class="mt-0.5 h-4 w-4 flex-shrink-0" />
								<div>
									<div class="font-medium">Repair Successful</div>
									{githubStore.lastRepairResult.message}
								</div>
							{:else}
								<AlertCircle class="mt-0.5 h-4 w-4 flex-shrink-0" />
								<div>
									<div class="font-medium">Repair Failed</div>
									{githubStore.lastRepairResult.error}
								</div>
							{/if}
						</div>
					{/if}

					<div class="text-muted-foreground text-sm">
						Health checks verify that the local Git repository is properly initialized and
						functional. If issues are detected, use the repair function to attempt automatic fixes.
					</div>
				</div>
			{/if}

			<div class="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
				<h3 class="text-lg font-medium">Manual Sync</h3>
				<Button
					data-testid="github-sync-now-button"
					onclick={syncNow}
					disabled={!isConnected || githubStore.syncing}
					title={!isConnected ? 'Configure GitHub connection first' : 'Sync documents to GitHub'}
				>
					{#if githubStore.syncing}
						<Loader2 class="mr-2 h-4 w-4 animate-spin" />
						Syncing...
					{:else}
						<RefreshCw class="mr-2 h-4 w-4" />
						Sync Now
					{/if}
				</Button>
			</div>

			{#if githubStore.lastSyncResult}
				<div class="space-y-2 rounded-lg border p-4">
					<div class="flex items-center gap-2">
						{#if githubStore.lastSyncResult.success}
							<CheckCircle class="h-4 w-4 text-green-500" />
							<span class="font-medium text-green-600 dark:text-green-400"
								>Last Sync Successful</span
							>
						{:else}
							<AlertCircle class="h-4 w-4 text-red-500" />
							<span class="text-destructive font-medium">Last Sync Failed</span>
						{/if}
					</div>

					<div class="text-muted-foreground text-sm">
						{formatLastSync(githubStore.lastSyncResult.timestamp)}
					</div>

					<div class="text-sm">{githubStore.lastSyncResult.message}</div>

					{#if githubStore.lastSyncResult.syncedFiles !== undefined}
						<div class="text-muted-foreground text-sm">
							Files synced: {githubStore.lastSyncResult.syncedFiles}
						</div>
					{/if}

					{#if githubStore.lastSyncResult.errors && githubStore.lastSyncResult.errors.length > 0}
						<div class="space-y-1">
							<div class="text-destructive text-sm font-medium">Errors:</div>
							{#each githubStore.lastSyncResult.errors as error, index (index)}
								<div class="text-destructive text-sm">• {error}</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

			<div class="text-muted-foreground text-sm">
				{#if isConnected}
					<p>
						Manual sync will immediately push all your documents to the configured GitHub
						repository.
					</p>
					<p class="mt-2">
						This operation may take a few moments depending on the number of documents.
					</p>
				{:else}
					<p>
						Configure your GitHub connection in the "Setup" tab to enable manual sync functionality.
					</p>
				{/if}
			</div>
		</div>
	{/if}
</div>
