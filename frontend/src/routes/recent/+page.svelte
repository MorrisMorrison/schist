<script lang="ts">
	import FolderView from '$lib/components/FolderView.svelte';
	import { CircleX } from 'lucide-svelte';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Recent Documents - Schist</title>
	<meta name="description" content="Recently updated documents in your wiki" />
</svelte:head>

{#if data.error}
	<!-- Error Message -->
	<div class="mx-auto max-w-7xl space-y-8 p-6">
		<div class="rounded-md bg-red-50 p-4">
			<div class="flex">
				<div class="flex-shrink-0">
					<CircleX class="h-5 w-5 text-red-400"></CircleX>
				</div>
				<div class="ml-3">
					<h3 class="text-sm font-medium text-red-800">Error loading recent documents</h3>
					<div class="mt-2 text-sm text-red-700">
						<p>{data.error}. Please check that the backend server is running.</p>
					</div>
				</div>
			</div>
		</div>
	</div>
{:else}
	<!-- Recent Documents using FolderView in recent mode -->
	<FolderView
		mode="recent"
		recentLimit={10}
		showCreateButtons={true}
		initialDocuments={data.recentDocuments}
		initialFolders={[]}
	/>
{/if}
