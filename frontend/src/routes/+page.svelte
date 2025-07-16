<script lang="ts">
	import PageList from '$lib/components/PageList.svelte';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Schist Wiki</title>
	<meta name="description" content="A lightweight, fast wiki for your documentation needs" />
</svelte:head>

<div class="space-y-8">
	<!-- Hero Section -->
	 {#if data.totalPages === 0}
	<div class="text-center">
		<div class="mx-auto max-w-3xl">
			<h1 class="text-4xl font-bold tracking-tight text-primary sm:text-6xl">
				Welcome to <span class="text-blue-primary">Schist</span>
			</h1>
			<p class="mt-6 text-lg leading-8 text-secondary">
				A lightweight, fast wiki for all your documentation needs. Create, edit, and organize your
				knowledge with ease.
			</p>
			<!-- <div class="mt-10 flex items-center justify-center gap-x-6">
				<a
					href="/new"
					class="rounded-md bg-blue-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
				>
					Create Your First Page
				</a> -->
				<!-- <a href="/pages" class="text-sm leading-6 font-semibold text-gray-900">
					Browse All Pages <span aria-hidden="true">→</span>
				</a> -->
			<!-- </div> -->
		</div>
	</div>
	{/if}

	<!-- Stats -->
	<!-- {#if data.totalPages > 0}
		<div class="mx-auto max-w-2xl">
			<div class="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200">
				<div class="text-center">
					<div class="text-3xl font-bold text-blue-600">{data.totalPages}</div>
					<div class="mt-1 text-sm text-gray-600">
						{data.totalPages === 1 ? 'Page' : 'Pages'} Created
					</div>
				</div>
			</div>
		</div>
	{/if} -->

	<!-- Recent Pages -->
	{#if data.recentPages.length > 0}
		<div class="space-y-4">
			<div class="flex items-center justify-between">
				<h2 class="text-2xl font-bold text-primary">Recent Pages</h2>
				<a href="/pages" class="text-sm font-medium text-blue-primary hover:text-blue-secondary">
					View all pages →
				</a>
			</div>

			<div class="rounded-lg bg-primary shadow-sm ring-1 ring-border-primary">
				<div class="p-6">
					<PageList pages={data.recentPages} showDates={true} showTags={true} />
				</div>
			</div>
		</div>
	{:else}
		<!-- Empty State -->
		<div class="rounded-lg bg-primary p-12 text-center shadow-sm ring-1 ring-border-primary">
			<svg
				class="mx-auto h-12 w-12 text-muted"
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
			<h3 class="mt-4 text-lg font-medium text-primary">No pages yet</h3>
			<p class="mt-2 text-secondary">Get started by creating your first wiki page.</p>
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
					<h3 class="text-sm font-medium text-red-800">Error loading pages</h3>
					<div class="mt-2 text-sm text-red-700">
						<p>{data.error}. Please check that the backend server is running.</p>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>
