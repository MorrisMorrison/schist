<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { Home, ExternalLink, Github, ArrowLeft } from 'lucide-svelte';
	import MarkdownRenderer from '$lib/components/markdown/MarkdownRenderer.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import { apiClient } from '$lib/api/client';
	import type { GitHubDocument } from '$lib/api/types';

	let content = $state('');
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let gitHubDocument = $state<GitHubDocument | null>(null);

	const encodedPath = $derived(page.params.path || '');
	const decodedPath = $derived(decodeURIComponent(encodedPath));
	const [owner, repo, ...filePaths] = $derived(decodedPath.split('/'));
	const filePath = $derived(filePaths.join('/'));
	const fileName = $derived(filePath.split('/').pop() || '');

	onMount(() => {
		loadContent();
	});

	$effect(() => {
		if (encodedPath !== undefined) {
			loadContent();
		}
	});

	async function loadContent() {
		if (!owner || !repo || !filePath) {
			error = 'Invalid GitHub document path';
			isLoading = false;
			return;
		}

		isLoading = true;
		error = null;
		content = '';
		gitHubDocument = null;

		try {
			gitHubDocument = await apiClient.getDocumentContent(owner, repo, filePath);
			content = gitHubDocument.content;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load GitHub document';
		} finally {
			isLoading = false;
		}
	}

	function openOnGitHub() {
		if (owner && repo && filePath && gitHubDocument) {
			const branch = gitHubDocument.branch || 'main';
			window.open(`https://github.com/${owner}/${repo}/blob/${branch}/${filePath}`, '_blank');
		}
	}

	function goBack() {
		window.history.back();
	}
</script>

<svelte:head>
	<title>{fileName} - {owner}/{repo}</title>
	<meta name="description" content="GitHub documentation: {fileName}" />
</svelte:head>

<div class="min-h-screen">
	{#if isLoading}
		<div class="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center">
			<div class="mb-4">
				<LoadingSpinner size="lg" />
			</div>
			<p class="text-muted-foreground">Loading GitHub document...</p>
		</div>
	{:else if error}
		<div class="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center">
			<h1 class="text-foreground mb-4 text-2xl font-semibold">Error</h1>
			<p class="text-muted-foreground mb-8 max-w-2xl">{error}</p>
			<div class="flex gap-4">
				<Button onclick={loadContent}>Try Again</Button>
				<Button variant="outline" onclick={goBack}>Go Back</Button>
			</div>
		</div>
	{:else if content && gitHubDocument}
		<div class="mx-auto max-w-7xl space-y-8 p-6">
			<!-- Header with GitHub indicator -->
			<header
				class="border-border flex flex-col gap-6 border-b pb-6 md:flex-row md:items-start md:justify-between"
			>
				<div class="flex-1">
					<!-- GitHub Repository Badge -->
					<div class="mb-4 flex items-center gap-2">
						<Github class="h-5 w-5 text-blue-600" />
						<span
							class="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700"
						>
							GitHub Repository
						</span>
					</div>

					<h1 class="text-primary mb-4 text-4xl leading-tight font-bold">
						{fileName}
					</h1>

					<!-- Repository Information -->
					<div class="text-muted-foreground flex flex-wrap items-center gap-4 text-sm">
						<div class="flex items-center gap-2">
							<Github class="h-4 w-4" />
							<span>{owner}/{repo}</span>
						</div>
						<div class="flex items-center gap-2">
							<span>Path: {filePath}</span>
						</div>
						<div class="flex items-center gap-2">
							<span>Size: {gitHubDocument.size} bytes</span>
						</div>
					</div>
				</div>

				<!-- Action Buttons -->
				<div class="flex gap-2">
					<Button variant="outline" size="sm" onclick={goBack}>
						<ArrowLeft class="h-4 w-4" />
						Back
					</Button>

					<Button variant="outline" size="sm" onclick={openOnGitHub}>
						<ExternalLink class="h-4 w-4" />
						View on GitHub
					</Button>
				</div>
			</header>

			<!-- Document Content -->
			<main class="bg-content ring-border-primary rounded-lg p-8 shadow-sm ring-1">
				<!-- External Source Notice -->
				<div class="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
					<div class="flex items-start gap-3">
						<Github class="mt-0.5 h-5 w-5 text-blue-600" />
						<div>
							<h3 class="mb-1 font-medium text-blue-900">External GitHub Document</h3>
							<p class="text-sm text-blue-700">
								This document is from the GitHub repository
								<strong>{owner}/{repo}</strong> and is read-only. Changes cannot be made through Schist.
							</p>
						</div>
					</div>
				</div>

				<!-- Rendered Content -->
				<div class="max-w-none">
					<MarkdownRenderer {content} />
				</div>
			</main>
		</div>
	{:else}
		<div class="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center">
			<h1 class="text-foreground mb-4 text-2xl font-semibold">Document Not Found</h1>
			<p class="text-muted-foreground mb-8 max-w-2xl">
				The GitHub document you're looking for could not be found or loaded.
			</p>
			<div class="flex gap-4">
				<Button onclick={goBack}>Go Back</Button>
				<Button variant="outline" onclick={() => goto('/')}>
					<Home class="h-4 w-4" />
					Go to Home
				</Button>
			</div>
		</div>
	{/if}
</div>
