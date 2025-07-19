<script lang="ts">
	import PageList from '$lib/components/PageList.svelte';
	import CardContent from '$lib/components/ui/card/card-content.svelte';
	import { Card } from '$lib/components/ui/card/index.js';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Recent Pages - Schist Wiki</title>
	<meta name="description" content="Recently updated pages in your wiki" />
</svelte:head>
<div class="mx-auto max-w-7xl space-y-8 p-6">
	<!-- Header -->

	<div
		class="flex w-full flex-col items-start gap-4 border-b pb-6 md:flex-row md:items-start md:justify-between md:gap-6"
	>
		<div class="space-y-2">
			<h1 class="text-primary text-3xl font-bold">Recent Pages</h1>
			<p class="text-secondary text-lg">
				{data.totalPages > 0
					? `Showing ${data.recentPages.length} of ${data.totalPages} pages, sorted by most recent activity`
					: 'No pages found'}
			</p>
		</div>
	</div>

	<!-- Recent Pages List -->
	{#if data.recentPages.length > 0}
		<Card class="p-6">
			<CardContent>
				<section class="space-y-4">
					<h2 class="text-primary text-lg font-medium">Pages</h2>
					<PageList pages={data.recentPages} showDates={true} showTags={true} />
				</section>
			</CardContent>
		</Card>
		<!-- <div class="bg-primary ring-border-primary rounded-lg shadow-sm ring-1">
			<div class="p-6">
			</div>
		</div> -->
	{:else}
		<!-- Empty State -->
		<div class="bg-primary ring-border-primary rounded-lg p-12 text-center shadow-sm ring-1">
			<svg
				class="text-muted mx-auto h-12 w-12"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z"
				/>
			</svg>
			<h3 class="text-primary mt-4 text-lg font-medium">No pages yet</h3>
			<p class="text-secondary mt-2">Get started by creating your first wiki page.</p>
			<div class="mt-6">
				<a
					href="/new"
					class="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
				>
					<svg class="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 4v16m8-8H4"
						/>
					</svg>
					Create First Page
				</a>
			</div>
		</div>
	{/if}

	<!-- Error Message -->
	{#if data.error}
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
					<h3 class="text-sm font-medium text-red-800">Error loading recent pages</h3>
					<div class="mt-2 text-sm text-red-700">
						<p>{data.error}. Please check that the backend server is running.</p>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>
