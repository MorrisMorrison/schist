<script lang="ts">
	import { onMount } from 'svelte';
	import { githubActions, isGitHubLoading } from '$lib/stores/github';
	import { apiClient } from '$lib/api/client';
	import { goto } from '$app/navigation';
	import {
		ChevronRight,
		ChevronDown,
		Github,
		FileText,
		RefreshCw,
		ExternalLink,
		Eye
	} from 'lucide-svelte';
	import type { GitHubRepoConfig, GitHubDocument } from '$lib/api/types';

	let repositories = $state<GitHubRepoConfig[]>([]);
	let expandedRepos = $state<Set<string>>(new Set());
	let repoFiles = $state<Map<string, GitHubDocument[]>>(new Map());
	let loadingFiles = $state<Set<string>>(new Set());

	onMount(async () => {
		await loadRepositories();
	});

	// Reactive effect to reload repositories when GitHub operations complete
	let lastLoadTime = $state(0);
	
	$effect(() => {
		// Reload when loading state changes from true to false (operation completed)
		const currentTime = Date.now();
		if ($isGitHubLoading === false && currentTime - lastLoadTime > 1000) {
			lastLoadTime = currentTime;
			loadRepositories();
		}
	});

	async function loadRepositories() {
		try {
			repositories = await githubActions.getDocsRepositories();
		} catch (error) {
			console.error('Failed to load GitHub docs repositories:', error);
		}
	}

	async function toggleRepository(owner: string, repo: string) {
		const repoKey = `${owner}/${repo}`;

		if (expandedRepos.has(repoKey)) {
			expandedRepos.delete(repoKey);
			expandedRepos = new Set(expandedRepos);
		} else {
			expandedRepos.add(repoKey);
			expandedRepos = new Set(expandedRepos);

			// Load files if not already loaded
			if (!repoFiles.has(repoKey)) {
				await loadRepoFiles(owner, repo);
			}
		}
	}

	async function loadRepoFiles(owner: string, repo: string) {
		const repoKey = `${owner}/${repo}`;
		loadingFiles.add(repoKey);
		loadingFiles = new Set(loadingFiles);

		try {
			const response = await apiClient.listDocsFiles(owner, repo);
			repoFiles.set(repoKey, response.files);
			repoFiles = new Map(repoFiles);
		} catch (error) {
			console.error(`Failed to load files for ${repoKey}:`, error);
		} finally {
			loadingFiles.delete(repoKey);
			loadingFiles = new Set(loadingFiles);
		}
	}

	async function syncRepository(event: Event, owner: string, repo: string) {
		event.stopPropagation();
		try {
			await githubActions.syncDocsRepository(owner, repo);
			await loadRepositories();

			// Reload files if currently expanded
			const repoKey = `${owner}/${repo}`;
			if (expandedRepos.has(repoKey)) {
				await loadRepoFiles(owner, repo);
			}
		} catch (error) {
			console.error(`Failed to sync ${owner}/${repo}:`, error);
		}
	}

	function openGitHubRepo(event: Event, owner: string, repo: string) {
		event.stopPropagation();
		window.open(`https://github.com/${owner}/${repo}`, '_blank');
	}

	function viewDocument(owner: string, repo: string, file: GitHubDocument) {
		// Navigate to a special GitHub docs viewer
		const encodedPath = encodeURIComponent(`${owner}/${repo}/${file.path}`);
		goto(`/github-docs/${encodedPath}`);
	}

	function getFileIcon(filename: string) {
		if (filename.endsWith('.md')) return FileText;
		return FileText;
	}
</script>

{#if repositories && repositories.length > 0}
	<div class="border-border mt-4 border-t pt-4">
		<div class="mb-2 px-3">
			<h3 class="text-muted-foreground flex items-center gap-2 text-sm font-semibold">
				<Github class="h-4 w-4" />
				GitHub Docs
			</h3>
		</div>

		<div class="space-y-1">
			{#each repositories as repo (repo.owner + '/' + repo.repository)}
				{@const repoKey = `${repo.owner}/${repo.repository}`}
				{@const isExpanded = expandedRepos.has(repoKey)}
				{@const files = repoFiles.get(repoKey) || []}
				{@const isLoadingFiles = loadingFiles.has(repoKey)}

				<div class="px-2">
					<div
						class="hover:bg-accent hover:text-accent-foreground group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors"
					>
						<button
							class="flex flex-1 items-center gap-2"
							onclick={() => toggleRepository(repo.owner, repo.repository)}
						>
							{#if isExpanded}
								<ChevronDown class="text-muted-foreground h-4 w-4" />
							{:else}
								<ChevronRight class="text-muted-foreground h-4 w-4" />
							{/if}

							<Github class="text-muted-foreground h-4 w-4" />

							<span class="flex-1 truncate text-left">
								{repo.owner}/{repo.repository}
							</span>
						</button>

						<div class="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
							<button
								class="hover:bg-accent rounded p-1"
								onclick={(e) => syncRepository(e, repo.owner, repo.repository)}
								disabled={$isGitHubLoading}
								title="Sync repository"
							>
								<RefreshCw class="h-3 w-3" />
							</button>
							<button
								class="hover:bg-accent rounded p-1"
								onclick={(e) => openGitHubRepo(e, repo.owner, repo.repository)}
								title="Open on GitHub"
							>
								<ExternalLink class="h-3 w-3" />
							</button>
						</div>
					</div>

					{#if isExpanded}
						<div class="mt-1 ml-6 space-y-1">
							{#if isLoadingFiles}
								<div class="text-muted-foreground flex items-center gap-2 px-2 py-1 text-xs">
									<RefreshCw class="h-3 w-3 animate-spin" />
									Loading files...
								</div>
							{:else if files.length > 0}
								{#each files as file (file.path)}
									{@const fileName = file.path.split('/').pop() || file.path}
									{@const FileIcon = getFileIcon(fileName)}
									<button
										class="hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors"
										onclick={() => viewDocument(repo.owner, repo.repository, file)}
									>
										<FileIcon class="text-muted-foreground h-4 w-4" />
										<span class="flex-1 truncate text-left">{fileName}</span>
										<Eye class="text-muted-foreground h-3 w-3 opacity-0 group-hover:opacity-100" />
									</button>
								{/each}
							{:else}
								<div class="text-muted-foreground px-2 py-1 text-xs">
									No files found in docs folder
								</div>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	</div>
{/if}
