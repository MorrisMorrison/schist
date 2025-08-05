<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { apiClient } from '$lib/api/client';
	import type { Document } from '$lib/api/types';
	import { Search, FileText, Clock, Folder } from 'lucide-svelte';
	import {
		fuzzySearchDocuments,
		addToRecentDocuments,
		getRecentDocumentPaths
	} from '$lib/utils/fuzzy-search';

	interface Props {
		open: boolean;
		onClose: () => void;
	}

	let { open, onClose }: Props = $props();

	let query = $state('');
	let results: Document[] = $state([]);
	let recentDocuments: Document[] = $state([]);
	let allDocuments: Document[] = $state([]);
	let selectedIndex = $state(0);
	let isSearching = $state(false);
	let searchTimeout: ReturnType<typeof setTimeout>;
	let inputElement = $state<HTMLInputElement>();

	// Derived state - automatically computed, no infinite loops
	const displayResults = $derived(
		query.trim() === '' 
			? recentDocuments.slice(0, 8)
			: results.slice(0, 10)
	);

	$effect(() => {
		if (open) {
			selectedIndex = 0;
			query = '';
			loadInitialData();
			// Focus input after modal opens
			setTimeout(() => inputElement?.focus(), 50);
		}
	});

	$effect(() => {
		if (query.trim().length > 0) {
			clearTimeout(searchTimeout);
			searchTimeout = setTimeout(performSearch, 150);
		} else {
			results = [];
			selectedIndex = 0;
		}
		
		// Cleanup timeout on effect cleanup
		return () => {
			clearTimeout(searchTimeout);
		};
	});

	async function loadInitialData() {
		try {
			// Load all documents for local fuzzy search
			allDocuments = await apiClient.getDocuments();

			// Load recent documents
			const recentPaths = getRecentDocumentPaths();
			recentDocuments = recentPaths
				.map((path) => allDocuments.find((doc) => doc.metaData.path === path))
				.filter((doc): doc is Document => doc !== undefined)
				.slice(0, 8);
		} catch (error) {
			console.error('Failed to load documents:', error);
			allDocuments = [];
			recentDocuments = [];
		}
	}

	function performSearch() {
		if (query.trim().length === 0) return;

		isSearching = true;
		try {
			// Use local fuzzy search instead of API call for better UX
			const searchResults = fuzzySearchDocuments(allDocuments, query.trim());
			results = [...searchResults];
			selectedIndex = 0;
		} catch (error) {
			console.error('Search failed:', error);
			results = [];
		} finally {
			isSearching = false;
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		switch (event.key) {
			case 'Escape':
				event.preventDefault();
				onClose();
				break;
			case 'ArrowDown':
				event.preventDefault();
				selectedIndex = Math.min(selectedIndex + 1, displayResults.length - 1);
				break;
			case 'ArrowUp':
				event.preventDefault();
				selectedIndex = Math.max(selectedIndex - 1, 0);
				break;
			case 'Enter':
				event.preventDefault();
				if (displayResults[selectedIndex]) {
					selectDocument(displayResults[selectedIndex]);
				}
				break;
		}
	}

	function selectDocument(document: Document) {
		// Track as recent document
		addToRecentDocuments(document.metaData.path);

		// Navigate to document
		goto(`/documents${document.metaData.path}`);
		onClose();
	}

	function getParentPath(path: string): string {
		const segments = path.split('/').filter(Boolean);
		if (segments.length <= 1) return 'Root';
		return segments.slice(0, -1).join('/');
	}
</script>

{#if open}
	<div
		class="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[10vh]"
		onclick={(e) => {
			if (e.target === e.currentTarget) onClose();
		}}
		onkeydown={(e) => {
			if (e.key === 'Escape') onClose();
		}}
		role="dialog"
		aria-modal="true"
		aria-label="Quick document switcher"
		tabindex="-1"
	>
		<div
			class="bg-card border-border w-full max-w-2xl rounded-lg border shadow-2xl"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="document"
		>
			<div class="flex items-center gap-3 border-b p-4">
				<Search class="text-muted-foreground h-5 w-5" />
				<input
					bind:this={inputElement}
					bind:value={query}
					onkeydown={handleKeydown}
					placeholder="Search documents... (type to search, use arrows to navigate)"
					class="placeholder:text-muted-foreground flex-1 bg-transparent text-lg outline-none"
					autocomplete="off"
					spellcheck="false"
				/>
				{#if isSearching}
					<div
						class="border-border border-t-primary h-4 w-4 animate-spin rounded-full border-2"
					></div>
				{/if}
			</div>

			<div class="max-h-96 overflow-y-auto">
				{#if displayResults.length === 0}
					<div
						class="text-muted-foreground flex flex-col items-center justify-center py-8 text-center"
					>
						{#if query.trim() === ''}
							<Clock class="mb-2 h-8 w-8" />
							<p>No recent documents</p>
							<p class="text-sm">Start typing to search all documents</p>
						{:else}
							<FileText class="mb-2 h-8 w-8" />
							<p>No documents found</p>
							<p class="text-sm">Try different search terms</p>
						{/if}
					</div>
				{:else}
					{#if query.trim() === '' && recentDocuments.length > 0}
						<div
							class="text-muted-foreground border-border border-b px-4 py-2 text-xs font-medium tracking-wider uppercase"
						>
							Recent Documents
						</div>
					{/if}

					{#each displayResults as document, index (document.metaData.path)}
						<button
							type="button"
							class="hover:bg-accent focus:bg-accent flex w-full items-center gap-3 px-4 py-3 text-left transition-colors {selectedIndex ===
							index
								? 'bg-accent'
								: ''}"
							onclick={() => selectDocument(document)}
							onmouseenter={() => (selectedIndex = index)}
						>
							<div class="bg-primary/10 text-primary flex-shrink-0 rounded p-1.5">
								<FileText class="h-4 w-4" />
							</div>

							<div class="min-w-0 flex-1">
								<div class="text-foreground truncate font-medium">
									{document.metaData.title}
								</div>
								<div class="text-muted-foreground flex items-center gap-1 text-sm">
									<Folder class="h-3 w-3" />
									<span class="truncate">{getParentPath(document.metaData.path)}</span>
								</div>
							</div>

							{#if document.metaData.tags && document.metaData.tags.length > 0}
								<div class="flex gap-1">
									{#each document.metaData.tags.slice(0, 2) as tag}
										<span
											class="bg-secondary text-secondary-foreground rounded px-1.5 py-0.5 text-xs"
										>
											{tag}
										</span>
									{/each}
									{#if document.metaData.tags.length > 2}
										<span class="text-muted-foreground text-xs"
											>+{document.metaData.tags.length - 2}</span
										>
									{/if}
								</div>
							{/if}
						</button>
					{/each}
				{/if}
			</div>

			<div class="text-muted-foreground border-t px-4 py-2 text-xs">
				<div class="flex items-center justify-between">
					<span>Use ↑↓ to navigate, Enter to select, Esc to close</span>
					<span class="font-mono">⌘K</span>
				</div>
			</div>
		</div>
	</div>
{/if}
