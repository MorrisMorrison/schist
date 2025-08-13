<script lang="ts">
	import { onMount } from 'svelte';
	import { githubActions, isGitHubLoading, githubError, isGitHubSyncing } from '$lib/stores/github';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import { AlertCircle, Plus, Trash2, RefreshCw, BookOpen, ExternalLink } from 'lucide-svelte';
	import type { GitHubRepoConfig } from '$lib/api/types';

	let repositories = $state<GitHubRepoConfig[]>([]);
	let newOwner = $state('');
	let newRepo = $state('');
	let newDocsFolder = $state('docs');
	let showAddForm = $state(false);
	let error = $state('');

	onMount(async () => {
		try {
			await loadRepositories();
		} catch (err) {
			console.error('Failed to load repositories on mount:', err);
			error = err instanceof Error ? err.message : 'Failed to initialize docs manager';
		}
	});

	async function loadRepositories() {
		try {
			if (!githubActions || typeof githubActions.getDocsRepositories !== 'function') {
				throw new Error('GitHub actions not available');
			}
			repositories = await githubActions.getDocsRepositories();
			error = ''; // Clear any previous errors
		} catch (err) {
			console.error('loadRepositories error:', err);
			error = err instanceof Error ? err.message : 'Failed to load repositories';
			repositories = []; // Ensure repositories is always an array
		}
	}

	async function addRepository() {
		if (!newOwner.trim() || !newRepo.trim()) {
			error = 'Owner and repository name are required';
			return;
		}

		try {
			await githubActions.addDocsRepository(
				newOwner.trim(),
				newRepo.trim(),
				newDocsFolder.trim() || 'docs'
			);

			// Automatically sync the newly added repository
			await githubActions.syncDocsRepository(newOwner.trim(), newRepo.trim());

			await loadRepositories();

			// Reset form
			newOwner = '';
			newRepo = '';
			newDocsFolder = 'docs';
			showAddForm = false;
			error = '';
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to add repository';
		}
	}

	async function removeRepository(owner: string, repo: string) {
		try {
			await githubActions.removeDocsRepository(owner, repo);
			await loadRepositories();
			error = '';
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to remove repository';
		}
	}

	async function syncRepository(owner: string, repo: string) {
		try {
			await githubActions.syncDocsRepository(owner, repo);
			await loadRepositories();
			error = '';
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to sync repository';
		}
	}

	async function syncAllRepositories() {
		try {
			await githubActions.syncAllDocsRepositories();
			await loadRepositories();
			error = '';
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to sync all repositories';
		}
	}

	function formatDate(dateString: string): string {
		if (!dateString) return 'Never';
		try {
			return new Date(dateString).toLocaleString();
		} catch {
			return 'Invalid date';
		}
	}
</script>

<Card>
	<CardHeader>
		<CardTitle class="flex items-center gap-3">
			<BookOpen class="h-6 w-6 text-[--muted-foreground]" />
			Documentation Repositories
		</CardTitle>
		<CardDescription>
			Add GitHub repositories to view their documentation in Schist. Files will be read-only.
		</CardDescription>
	</CardHeader>
	<CardContent class="space-y-6">
		<!-- Error Display -->
		{#if error || $githubError}
			<div
				class="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-red-800"
			>
				<AlertCircle class="h-4 w-4" />
				<span class="text-sm">{error || $githubError}</span>
			</div>
		{/if}

		<!-- Action Buttons -->
		<div class="flex flex-wrap gap-3">
			<Button
				variant="outline"
				onclick={() => (showAddForm = !showAddForm)}
				disabled={$isGitHubLoading}
			>
				<Plus class="mr-2 h-4 w-4" />
				Add Repository
			</Button>

			{#if repositories && repositories.length > 0}
				<Button
					variant="outline"
					onclick={syncAllRepositories}
					disabled={$isGitHubSyncing || $isGitHubLoading}
				>
					{#if $isGitHubSyncing}
						<RefreshCw class="mr-2 h-4 w-4 animate-spin" />
					{:else}
						<RefreshCw class="mr-2 h-4 w-4" />
					{/if}
					Sync All
				</Button>
			{/if}
		</div>

		<!-- Add Repository Form -->
		{#if showAddForm}
			<Card>
				<CardHeader>
					<CardTitle class="text-lg">Add Documentation Repository</CardTitle>
				</CardHeader>
				<CardContent>
					<form
						class="space-y-4"
						onsubmit={(e) => {
							e.preventDefault();
							addRepository();
						}}
					>
						<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<div class="space-y-2">
								<Label for="owner">Repository Owner</Label>
								<Input id="owner" bind:value={newOwner} placeholder="e.g., microsoft" required />
							</div>
							<div class="space-y-2">
								<Label for="repo">Repository Name</Label>
								<Input id="repo" bind:value={newRepo} placeholder="e.g., vscode" required />
							</div>
						</div>

						<div class="space-y-2">
							<Label for="docs-folder">Documentation Folder</Label>
							<Input id="docs-folder" bind:value={newDocsFolder} placeholder="docs" />
							<p class="text-muted-foreground text-sm">
								The folder containing documentation files (default: docs)
							</p>
						</div>

						<div class="flex gap-3">
							<Button type="submit" disabled={$isGitHubLoading}>
								{#if $isGitHubLoading}
									<RefreshCw class="mr-2 h-4 w-4 animate-spin" />
								{/if}
								Add Repository
							</Button>
							<Button variant="outline" onclick={() => (showAddForm = false)}>Cancel</Button>
						</div>
					</form>
				</CardContent>
			</Card>
		{/if}

		<!-- Repository List -->
		{#if repositories && repositories.length > 0}
			<div class="space-y-3">
				<h3 class="text-lg font-semibold">Configured Repositories</h3>
				<div class="space-y-3">
					{#each repositories as repo (repo.owner + '/' + repo.repository)}
						<Card>
							<CardContent class="p-4">
								<div class="flex items-center justify-between">
									<div class="space-y-1">
										<div class="flex items-center gap-2">
											<h4 class="font-semibold">{repo.owner}/{repo.repository}</h4>
											<a
												href="https://github.com/{repo.owner}/{repo.repository}"
												target="_blank"
												class="text-muted-foreground hover:text-foreground"
											>
												<ExternalLink class="h-4 w-4" />
											</a>
										</div>
										<div class="text-muted-foreground space-y-1 text-sm">
											<p>
												Docs folder: <code class="bg-muted rounded px-1 py-0.5 text-xs"
													>{repo.docs_folder}</code
												>
											</p>
											<p>Documents: {repo.document_count}</p>
											<p>Last sync: {formatDate(repo.last_sync)}</p>
											{#if repo.sync_error}
												<p class="text-red-600">Error: {repo.sync_error}</p>
											{/if}
										</div>
									</div>

									<div class="flex gap-2">
										<Button
											variant="outline"
											size="sm"
											onclick={() => syncRepository(repo.owner, repo.repository)}
											disabled={$isGitHubSyncing}
										>
											{#if $isGitHubSyncing}
												<RefreshCw class="h-4 w-4 animate-spin" />
											{:else}
												<RefreshCw class="h-4 w-4" />
											{/if}
										</Button>
										<Button
											variant="outline"
											size="sm"
											onclick={() => removeRepository(repo.owner, repo.repository)}
											disabled={$isGitHubLoading}
										>
											<Trash2 class="h-4 w-4" />
										</Button>
									</div>
								</div>
							</CardContent>
						</Card>
					{/each}
				</div>
			</div>
		{:else}
			<div class="py-8 text-center">
				<BookOpen class="text-muted-foreground mx-auto mb-4 h-12 w-12" />
				<h3 class="mb-2 text-lg font-semibold">No repositories configured</h3>
				<p class="text-muted-foreground mb-4">
					Add your first documentation repository to get started.
				</p>
				<Button onclick={() => (showAddForm = true)}>
					<Plus class="mr-2 h-4 w-4" />
					Add Repository
				</Button>
			</div>
		{/if}
	</CardContent>
</Card>
