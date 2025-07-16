<script lang="ts">
	import PageList from '$lib/components/PageList.svelte';
	import type { PageData } from './$types.js';
	import type { Page } from '$lib/api/types.js';

	let { data }: { data: PageData } = $props();

	let searchQuery = $state('');
	let sortBy = $state<'title' | 'created' | 'updated'>('title');
	let sortOrder = $state<'asc' | 'desc'>('asc');

	// Filter and sort pages based on search and sort options
	const filteredPages = $derived(
		data.pages
			.filter((page) => {
				if (!searchQuery.trim()) return true;
				const query = searchQuery.toLowerCase();
				return (
					page.metaData.title.toLowerCase().includes(query) ||
					page.metaData.slug?.toLowerCase().includes(query) ||
					(page.metaData.tags &&
						page.metaData.tags.some((tag) => tag.toLowerCase().includes(query))) ||
					page.content.toLowerCase().includes(query)
				);
			})
			.sort((a, b) => {
				let comparison = 0;

				switch (sortBy) {
					case 'title':
						comparison = a.metaData.title.localeCompare(b.metaData.title);
						break;
					case 'created':
						const createdA = new Date(a.metaData.created || 0).getTime();
						const createdB = new Date(b.metaData.created || 0).getTime();
						comparison = createdA - createdB;
						break;
					case 'updated':
						const updatedA = new Date(a.metaData.updated || a.metaData.created || 0).getTime();
						const updatedB = new Date(b.metaData.updated || b.metaData.created || 0).getTime();
						comparison = updatedA - updatedB;
						break;
				}

				return sortOrder === 'desc' ? -comparison : comparison;
			})
	);

	function toggleSort(newSortBy: typeof sortBy) {
		if (sortBy === newSortBy) {
			sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
		} else {
			sortBy = newSortBy;
			sortOrder = 'asc';
		}
	}

	// Group pages by first letter for alphabetical view
	const groupedPages = $derived(
		filteredPages.reduce(
			(groups, page) => {
				const firstLetter = page.metaData.title.charAt(0).toUpperCase();
				if (!groups[firstLetter]) {
					groups[firstLetter] = [];
				}
				groups[firstLetter].push(page);
				return groups;
			},
			{} as Record<string, Page[]>
		)
	);

	const groupedKeys = $derived(Object.keys(groupedPages).sort());
</script>

<svelte:head>
	<title>All Pages - Schist Wiki</title>
	<meta name="description" content="Browse all wiki pages" />
</svelte:head>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">All Pages</h1>
			<p class="mt-1 text-sm text-gray-600">
				{data.total}
				{data.total === 1 ? 'page' : 'pages'} total
				{filteredPages.length !== data.total ? ` (${filteredPages.length} shown)` : ''}
			</p>
		</div>

		<div class="flex items-center space-x-3">
			<a
				href="/new"
				class="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus:bg-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
			>
				<svg class="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 4v16m8-8H4"
					/>
				</svg>
				New Page
			</a>
		</div>
	</div>

	<!-- Search and Filters -->
	<div class="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200">
		<div class="space-y-4">
			<!-- Search -->
			<div>
				<label for="search" class="block text-sm font-medium text-gray-700">Search Pages</label>
				<div class="relative mt-1">
					<input
						type="text"
						bind:value={searchQuery}
						placeholder="Search by title, slug, or tags..."
						class="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 pl-10 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none"
					/>
					<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
						<svg
							class="h-4 w-4 text-gray-400"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="m21 21-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z"
							/>
						</svg>
					</div>
				</div>
			</div>

			<!-- Sort Options -->
			<div class="flex flex-wrap items-center gap-4">
				<span class="text-sm font-medium text-gray-700">Sort by:</span>

				<button
					type="button"
					onclick={() => toggleSort('title')}
					class="inline-flex items-center rounded-md px-2 py-1 text-sm font-medium transition-colors {sortBy ===
					'title'
						? 'bg-blue-100 text-blue-800'
						: 'text-gray-600 hover:bg-gray-100'}"
				>
					Title
					{#if sortBy === 'title'}
						<svg class="ml-1 h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							{#if sortOrder === 'asc'}
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M5 15l7-7 7 7"
								/>
							{:else}
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M19 9l-7 7-7-7"
								/>
							{/if}
						</svg>
					{/if}
				</button>

				<button
					type="button"
					onclick={() => toggleSort('updated')}
					class="inline-flex items-center rounded-md px-2 py-1 text-sm font-medium transition-colors {sortBy ===
					'updated'
						? 'bg-blue-100 text-blue-800'
						: 'text-gray-600 hover:bg-gray-100'}"
				>
					Last Updated
					{#if sortBy === 'updated'}
						<svg class="ml-1 h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							{#if sortOrder === 'asc'}
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M5 15l7-7 7 7"
								/>
							{:else}
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M19 9l-7 7-7-7"
								/>
							{/if}
						</svg>
					{/if}
				</button>

				<button
					type="button"
					onclick={() => toggleSort('created')}
					class="inline-flex items-center rounded-md px-2 py-1 text-sm font-medium transition-colors {sortBy ===
					'created'
						? 'bg-blue-100 text-blue-800'
						: 'text-gray-600 hover:bg-gray-100'}"
				>
					Created
					{#if sortBy === 'created'}
						<svg class="ml-1 h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							{#if sortOrder === 'asc'}
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M5 15l7-7 7 7"
								/>
							{:else}
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M19 9l-7 7-7-7"
								/>
							{/if}
						</svg>
					{/if}
				</button>
			</div>
		</div>
	</div>

	<!-- Pages Content -->
	{#if data.error}
		<!-- Error State -->
		<div class="rounded-md bg-red-50 p-4">
			<div class="flex">
				<div class="flex-shrink-0">
					<svg class="h-5 w-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
						/>
					</svg>
				</div>
				<div class="ml-3">
					<h3 class="text-sm font-medium text-red-800">Error loading pages</h3>
					<div class="mt-2 text-sm text-red-700">
						<p>{data.error}. Please check that the backend server is running.</p>
					</div>
				</div>
			</div>
		</div>
	{:else if filteredPages.length === 0 && searchQuery.trim()}
		<!-- No Search Results -->
		<div class="rounded-lg bg-gray-50 p-8 text-center">
			<svg
				class="mx-auto h-12 w-12 text-gray-400"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
				/>
			</svg>
			<h3 class="mt-4 text-lg font-medium text-gray-900">No pages found</h3>
			<p class="mt-2 text-gray-600">
				No pages match your search for "<span class="font-semibold">{searchQuery}</span>".
			</p>
			<div class="mt-4">
				<button
					type="button"
					onclick={() => (searchQuery = '')}
					class="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500"
				>
					Clear Search
				</button>
			</div>
		</div>
	{:else if sortBy === 'title' && !searchQuery.trim()}
		<!-- Alphabetical Grouping (only when sorted by title and no search) -->
		<div class="space-y-8">
			{#each groupedKeys as letter (letter)}
				<div>
					<h2 class="mb-4 border-b border-gray-200 pb-2 text-lg font-semibold text-gray-900">
						{letter}
					</h2>
					<PageList pages={groupedPages[letter]} showDates={true} showTags={true} />
				</div>
			{/each}
		</div>
	{:else}
		<!-- Regular List View -->
		<div class="rounded-lg bg-white shadow-sm ring-1 ring-gray-200">
			<div class="p-6">
				<PageList
					pages={filteredPages}
					showDates={true}
					showTags={true}
					emptyMessage="No pages have been created yet."
				/>
			</div>
		</div>
	{/if}

	<!-- Stats -->
	{#if filteredPages.length > 0}
		<div class="rounded-lg bg-blue-50 p-4">
			<div class="flex">
				<div class="flex-shrink-0">
					<svg class="h-5 w-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
						/>
					</svg>
				</div>
				<div class="ml-3">
					<h3 class="text-sm font-medium text-blue-800">Wiki Statistics</h3>
					<div class="mt-2 text-sm text-blue-700">
						<p>
							You have <strong>{data.total}</strong>
							{data.total === 1 ? 'page' : 'pages'} in your wiki.
							{#if searchQuery.trim()}
								Showing <strong>{filteredPages.length}</strong> matching your search.
							{/if}
						</p>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>
