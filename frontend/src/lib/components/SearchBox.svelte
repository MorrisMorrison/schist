<script lang="ts">
	import { apiClient } from '$lib/api/client';
	import type { Page } from '$lib/api/types';
	import { onMount } from 'svelte';

	let {
		placeholder = 'Search pages... (try "tag:name")',
		showResults = true,
		onSelect,
		id = 'search-input',
		testId = 'search-input'
	}: {
		placeholder?: string;
		showResults?: boolean;
		onSelect?: (page: Page) => void;
		id?: string;
		testId?: string;
	} = $props();

	let query = $state('');
	let results: Page[] = $state([]);
	let isSearching = $state(false);
	let showDropdown = $state(false);
	let searchTimeout: number;

	$effect(() => {
		if (query.trim().length > 0) {
			clearTimeout(searchTimeout);
			searchTimeout = setTimeout(performSearch, 300);
		} else {
			results = [];
			showDropdown = false;
		}
	});

	async function performSearch() {
		if (query.trim().length === 0) return;

		isSearching = true;
		try {
			const result = await apiClient.searchPages(query.trim());
			showDropdown = showResults && result.pages.length > 0;
			results = result.pages;
		} catch (error) {
			console.error('Search failed:', error);
			results = [];
			showDropdown = false;
		} finally {
			isSearching = false;
		}
	}

	function handleSelectPage(page: Page) {
		query = '';
		showDropdown = false;
		if (onSelect) {
			onSelect(page);
		} else {
			window.location.href = `/pages${page.metaData.path}`;
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			showDropdown = false;
			query = '';
		}
	}

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as Element;
		if (!target.closest('.search-container')) {
			showDropdown = false;
		}
	}

	onMount(() => {
		document.addEventListener('click', handleClickOutside);
		return () => {
			document.removeEventListener('click', handleClickOutside);
		};
	});
</script>

<div class="search-container relative">
	<div class="relative">
		<input
			{id}
			type="text"
			bind:value={query}
			onkeydown={handleKeydown}
			{placeholder}
			data-testid={testId}
			class="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 pl-10 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none"
		/>
		<div class="absolute inset-y-0 left-0 flex items-center pl-3">
			{#if isSearching}
				<div
					class="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600"
				></div>
			{:else}
				<svg class="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="m21 21-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z"
					/>
				</svg>
			{/if}
		</div>
	</div>

	{#if showDropdown}
		<div
			class="absolute top-full z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg"
			data-testid="search-results"
		>
			<div class="max-h-60 overflow-y-auto">
				{#each results as page, i (page.metaData.slug)}
					<button
						type="button"
						onclick={() => handleSelectPage(page)}
						class="w-full px-4 py-3 text-left first:rounded-t-lg last:rounded-b-lg hover:bg-gray-50 focus:bg-gray-50 focus:outline-none"
					>
						<div class="font-medium text-gray-900">{page.metaData.title}</div>
						<div class="text-sm text-gray-500">{page.metaData.path}</div>
						{#if page.metaData.tags && page.metaData.tags.length > 0}
							<div class="mt-1 flex flex-wrap gap-1">
								{#each page.metaData.tags as tag (tag)}
									<span class="rounded-full bg-blue-600 px-2 py-0.5 text-xs text-white">{tag}</span>
								{/each}
							</div>
						{/if}
					</button>
					{#if i < results.length - 1}
						<div class="mt-1 mr-4 mb-1 ml-4 border-t-1 bg-gray-100"></div>
					{/if}
				{/each}
			</div>
		</div>
	{/if}
</div>
