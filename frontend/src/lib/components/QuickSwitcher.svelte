<script lang="ts">
	import { goto } from '$app/navigation';
	import { apiClient } from '#lib/api/client.ts';
	import type { SnippetSegment } from '#lib/api/types.ts';
	import { Search, FileText, Clock, Folder } from '@lucide/svelte';
	import { addToRecentDocuments, getRecentDocumentPaths } from '#lib/utils/recent-documents.ts';
	import { getCachedDocuments } from '#lib/utils/markdown-cache.ts';
	import LoadingSpinner from '#lib/components/LoadingSpinner.svelte';
	import { Badge } from '#lib/components/ui/badge/index.ts';
	import { Dialog, DialogContent, DialogTitle } from '#lib/components/ui/dialog/index.ts';

	interface Props {
		open: boolean;
		onClose: () => void;
	}

	/** A row in the list: a recent document or a search hit. */
	interface Item {
		path: string;
		title: string;
		tags: string[];
		snippet?: SnippetSegment[];
	}

	const RESULT_LIMIT = 10;
	const RECENT_LIMIT = 8;

	let { open, onClose }: Props = $props();

	let query = $state('');
	let results: Item[] = $state([]);
	let recentDocuments: Item[] = $state([]);
	let selectedIndex = $state(0);
	let isSearching = $state(false);
	let searchTimeout: ReturnType<typeof setTimeout>;
	// Only the newest request may set results, so a slow early response
	// can't overwrite a later one.
	let latestRequest = 0;
	let inputElement = $state<HTMLInputElement>();

	const displayResults = $derived(query.trim() === '' ? recentDocuments : results);

	$effect(() => {
		if (open) {
			selectedIndex = 0;
			query = '';
			loadRecentDocuments();
			setTimeout(() => inputElement?.focus(), 50);
		}
	});

	$effect(() => {
		if (query.trim().length > 0) {
			clearTimeout(searchTimeout);
			isSearching = true; // from the first keystroke, so "No documents found" can't flash
			searchTimeout = setTimeout(performSearch, 150);
		} else {
			latestRequest++;
			results = [];
			isSearching = false;
			selectedIndex = 0;
		}

		return () => {
			clearTimeout(searchTimeout);
		};
	});

	async function loadRecentDocuments() {
		const recentPaths = getRecentDocumentPaths();
		if (recentPaths.length === 0) {
			recentDocuments = [];
			return;
		}
		try {
			const documents = await getCachedDocuments();
			recentDocuments = recentPaths
				.map((path) => documents.find((doc) => doc.metaData?.path === path))
				.filter((doc) => doc !== undefined)
				.slice(0, RECENT_LIMIT)
				.map((doc) => ({
					path: doc.metaData.path,
					title: doc.metaData.title,
					tags: doc.metaData.tags ?? []
				}));
		} catch (error) {
			console.error('QuickSwitcher: Failed to load recent documents', { error });
			recentDocuments = [];
		}
	}

	async function performSearch() {
		const text = query.trim();
		if (text.length === 0) return;

		const request = ++latestRequest;
		isSearching = true;
		try {
			const response = await apiClient.searchDocuments(text, RESULT_LIMIT);
			if (request !== latestRequest) return;
			results = response.results.map((hit) => ({
				path: hit.path,
				title: hit.title,
				tags: hit.tags ?? [],
				snippet: hit.snippet
			}));
			selectedIndex = 0;
		} catch (error) {
			if (request !== latestRequest) return;
			console.error('Search failed:', error);
			results = [];
		} finally {
			if (request === latestRequest) isSearching = false;
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		switch (event.key) {
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

	function selectDocument(item: Item) {
		addToRecentDocuments(item.path);

		goto(`/documents${item.path}`);
		onClose();
	}

	function getParentPath(path: string): string {
		const segments = path.split('/').filter(Boolean);
		if (segments.length <= 1) return 'Root';
		return segments.slice(0, -1).join('/');
	}
</script>

<!-- Escape and clicks outside the panel close it (handled by the dialog). -->
<Dialog {open} onOpenChange={(isOpen) => !isOpen && onClose()}>
	<DialogContent
		class="bg-card top-[10vh] translate-y-0 gap-0 p-0 shadow-2xl sm:max-w-2xl"
		showCloseButton={false}
		data-testid="quick-switcher"
	>
		<DialogTitle class="sr-only">Quick document switcher</DialogTitle>
		<div class="flex items-center gap-3 border-b p-4">
			<Search class="text-muted-foreground h-5 w-5" />
			<input
				bind:this={inputElement}
				bind:value={query}
				onkeydown={handleKeydown}
				placeholder="Search titles and text..."
				class="placeholder:text-muted-foreground flex-1 bg-transparent text-lg outline-none"
				autocomplete="off"
				spellcheck="false"
				data-testid="quick-switcher-input"
			/>
			{#if isSearching}
				<LoadingSpinner size="sm" />
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
					{:else if !isSearching}
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

				{#each displayResults as item, index (item.path)}
					<button
						type="button"
						class="hover:bg-accent focus:bg-accent flex w-full items-start gap-3 px-4 py-3 text-left transition-colors {selectedIndex ===
						index
							? 'bg-accent'
							: ''}"
						onclick={() => selectDocument(item)}
						onmouseenter={() => (selectedIndex = index)}
						data-testid="quick-switcher-result"
					>
						<div class="bg-primary/10 text-primary flex-shrink-0 rounded p-1.5">
							<FileText class="h-4 w-4" />
						</div>

						<div class="min-w-0 flex-1">
							<div class="text-foreground truncate font-medium">
								{item.title}
							</div>
							<div class="text-muted-foreground flex items-center gap-1 text-sm">
								<Folder class="h-3 w-3" />
								<span class="truncate">{getParentPath(item.path)}</span>
							</div>
							{#if item.snippet?.length}
								<p
									class="text-muted-foreground mt-1 line-clamp-2 text-sm"
									data-testid="quick-switcher-snippet"
								>
									{#each item.snippet as segment, i (i)}
										{#if segment.match}
											<mark class="bg-primary/15 text-foreground rounded-sm">{segment.text}</mark>
										{:else}
											{segment.text}
										{/if}
									{/each}
								</p>
							{/if}
						</div>

						{#if item.tags.length > 0}
							<div class="flex gap-1 self-start">
								{#each item.tags.slice(0, 2) as tag (tag)}
									<Badge variant="secondary">{tag}</Badge>
								{/each}
								{#if item.tags.length > 2}
									<span class="text-muted-foreground text-xs">+{item.tags.length - 2}</span>
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
	</DialogContent>
</Dialog>
