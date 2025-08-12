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
		lastSyncResult,
		gitHealthStatus,
		isCheckingHealth,
		isRepairingRepository,
		lastRepairResult
	} from '$lib/stores/github';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Separator } from '$lib/components/ui/separator';
	import { AlertCircle, CheckCircle, Loader2, Settings, RefreshCw } from 'lucide-svelte';
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
		if ($githubStatus && $githubStatus.connected) {
			token = '';

			const status = $githubStatus;
			owner = status.owner || '';
			repository = status.repository || '';
			branch = status.branch || 'main';
			backupMode = status.auto_sync ? 'auto' : 'manual';
			syncInterval = 60;
			tokenChanged = false;
		}
	});

	const isConnected = $derived($githubStatus?.connected ?? false);
	const canTestConnection = $derived(token.trim() && owner.trim() && repository.trim());
	const hasChanges = $derived(
		$githubStatus && $githubStatus.connected
			? (() => {
					const status = $githubStatus;
					return branch !== status.branch || (backupMode === 'auto') !== status.auto_sync;
				})()
			: canTestConnection
	);

	onMount(() => {
		if (!$githubStatus) {
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
			const tokenToUse = tokenChanged
				? token.trim()
				: $githubSettings?.config.token || token.trim();

			const setupRequest: GitHubSetupRequest = {
				token: tokenToUse,
				owner: owner.trim(),
				repo: repository.trim(),
				branch: branch.trim(),
				auto_sync: backupMode === 'auto',
				sync_on_save: false
			};

			await githubActions.setupGitHub(setupRequest);

			console.log('Setup completed, GitHub status:', $githubStatus);
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
						placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
						required
						oninput={() => (tokenChanged = true)}
					/>
					<p class="text-muted-foreground text-sm">
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
						<Input id="github-owner" data-testid="github-owner-input" bind:value={owner} placeholder="username or org" required />
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
					<Input id="github-branch" data-testid="github-branch-input" bind:value={branch} placeholder="main" required />
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

			{#if formError || $githubError}
				<div
					data-testid="github-error-alert"
					class="bg-destructive/10 text-destructive flex items-start gap-2 rounded-md p-3 text-sm"
				>
					<AlertCircle class="mt-0.5 h-4 w-4 flex-shrink-0" />
					<div class="space-y-1">
						<div class="font-medium">Error</div>
						<div data-testid="github-error-message">{formError || $githubError}</div>
						{#if $githubError?.includes('Git repository') || $githubError?.includes('health')}
							<div class="mt-2 text-xs opacity-75">
								💡 Try checking the Git repository health in the Sync tab to diagnose the issue.
							</div>
						{/if}
					</div>
				</div>
			{/if}

			{#if $connectionTest}
				<div
					data-testid="github-connection-test-result"
					class="flex items-center gap-2 rounded-md p-3 text-sm {$connectionTest.success
						? 'bg-accent/50 text-accent-foreground'
						: 'bg-destructive/10 text-destructive'}"
				>
					{#if $connectionTest.success}
						<CheckCircle class="h-4 w-4 flex-shrink-0" />
					{:else}
						<AlertCircle class="h-4 w-4 flex-shrink-0" />
					{/if}
					<span data-testid="github-connection-test-message">{$connectionTest.message}</span>
				</div>
			{/if}

			{#if isConnected && $githubStatus}
				<Separator />

				<div class="space-y-4">
					<h3 class="text-lg font-medium">Status</h3>

					<div class="grid grid-cols-1 gap-4 md:grid-cols-3">
						<div class="space-y-2">
							<Label>Connection Status</Label>
							<div class="flex items-center gap-2">
								{#if $githubStatus?.connected}
									<CheckCircle class="h-4 w-4 text-green-500" />
									<span data-testid="github-status-connected" class="text-sm text-green-600">Connected</span>
								{:else}
									<AlertCircle class="h-4 w-4 text-red-500" />
									<span data-testid="github-status-disconnected" class="text-destructive text-sm">Disconnected</span>
								{/if}
							</div>
						</div>

						<div class="space-y-2">
							<Label>Last Sync</Label>
							<div class="text-foreground text-sm">
								{formatLastSync($githubStatus?.last_sync)}
							</div>
						</div>

						{#if $githubStatus?.owner && $githubStatus?.repository}
							{@const status = $githubStatus}
							<div class="space-y-2">
								<Label>Repository</Label>
								<div class="flex items-center">
									<a
										href="https://github.com/{status.owner}/{status.repository}"
										target="_blank"
										class="text-primary truncate text-sm hover:underline"
										title="https://github.com/{status.owner}/{status.repository}"
									>
										{status.owner}/{status.repository}
									</a>
								</div>
							</div>
						{/if}
					</div>

					{#if $githubStatus?.error}
						<div
							class="bg-destructive/10 text-destructive flex items-center gap-2 rounded-md p-3 text-sm"
						>
							<AlertCircle class="h-4 w-4 flex-shrink-0" />
							{$githubStatus.error}
						</div>
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
						disabled={!canTestConnection || $isTestingConnection}
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
							data-testid="github-disconnect-button"
							variant="outline"
							onclick={disconnect}
							disabled={$isGitHubLoading}
						>
							Disconnect
						</Button>
					{/if}
					<Button
						type="submit"
						data-testid="github-setup-button"
						disabled={isConnected
							? !hasChanges || $isGitHubLoading
							: !canTestConnection || !hasChanges || $isGitHubLoading}
					>
						{#if $isGitHubLoading}
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
				<div class="flex items-center gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-700">
					<AlertCircle class="h-4 w-4 flex-shrink-0" />
					GitHub is not connected. Please complete the setup in the "Setup" tab before syncing.
				</div>
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
								disabled={$isCheckingHealth || $isRepairingRepository}
							>
								{#if $isCheckingHealth}
									<Loader2 class="mr-1 h-3 w-3 animate-spin" />
								{/if}
								Check Health
							</Button>
							{#if $gitHealthStatus && !$gitHealthStatus.healthy}
								<Button
									variant="outline"
									size="sm"
									onclick={repairRepository}
									disabled={$isRepairingRepository || $isCheckingHealth}
									class="border-orange-300 text-orange-600 hover:bg-orange-50"
								>
									{#if $isRepairingRepository}
										<Loader2 class="mr-1 h-3 w-3 animate-spin" />
									{/if}
									Repair
								</Button>
							{/if}
						</div>
					</div>

					{#if $gitHealthStatus}
						<div class="flex items-center gap-2">
							{#if $gitHealthStatus.healthy}
								<CheckCircle class="h-4 w-4 text-green-500" />
								<span class="text-sm text-green-600">Repository is healthy</span>
							{:else}
								<AlertCircle class="h-4 w-4 text-red-500" />
								<span class="text-sm text-red-600">Repository health issues detected</span>
							{/if}
						</div>

						{#if !$gitHealthStatus.healthy && $gitHealthStatus.error}
							<div class="bg-destructive/10 text-destructive rounded-md p-3 text-sm">
								<div class="mb-1 font-medium">Health Check Error:</div>
								{$gitHealthStatus.error}
								<div class="mt-2 text-xs opacity-75">
									💡 Click the "Repair" button to attempt automatic repository repair.
								</div>
							</div>
						{/if}
					{/if}

					{#if $lastRepairResult}
						<div
							class="flex items-start gap-2 rounded-md p-3 text-sm {$lastRepairResult.success
								? 'border border-green-200 bg-green-50 text-green-700'
								: 'border border-red-200 bg-red-50 text-red-700'}"
						>
							{#if $lastRepairResult.success}
								<CheckCircle class="mt-0.5 h-4 w-4 flex-shrink-0" />
								<div>
									<div class="font-medium">Repair Successful</div>
									{$lastRepairResult.message}
								</div>
							{:else}
								<AlertCircle class="mt-0.5 h-4 w-4 flex-shrink-0" />
								<div>
									<div class="font-medium">Repair Failed</div>
									{$lastRepairResult.error}
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
					disabled={!isConnected || $isGitHubSyncing}
					title={!isConnected ? 'Configure GitHub connection first' : 'Sync documents to GitHub'}
				>
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
							<span class="font-medium text-green-600">Last Sync Successful</span>
						{:else}
							<AlertCircle class="h-4 w-4 text-red-500" />
							<span class="text-destructive font-medium">Last Sync Failed</span>
						{/if}
					</div>

					<div class="text-muted-foreground text-sm">
						{formatLastSync($lastSyncResult.timestamp)}
					</div>

					<div class="text-sm">{$lastSyncResult.message}</div>

					{#if $lastSyncResult.syncedFiles !== undefined}
						<div class="text-muted-foreground text-sm">
							Files synced: {$lastSyncResult.syncedFiles}
						</div>
					{/if}

					{#if $lastSyncResult.errors && $lastSyncResult.errors.length > 0}
						<div class="space-y-1">
							<div class="text-destructive text-sm font-medium">Errors:</div>
							{#each $lastSyncResult.errors as error, index (index)}
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
