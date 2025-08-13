<script lang="ts">
	import FolderView from '$lib/components/folder/FolderView.svelte';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
</script>

<svelte:head>
	<title>Recent Documents - Schist</title>
	<meta name="description" content="Recently updated documents in your wiki" />
</svelte:head>

{#if data.loadError}
	<div class="mx-auto max-w-7xl space-y-8 p-6">
		<div class="text-destructive border-destructive bg-destructive/10 rounded-lg border p-4">
			<p class="font-medium">Error loading documents</p>
			<p class="text-sm">{data.loadError}</p>
		</div>
	</div>
{:else}
	<FolderView
		mode="recent"
		recentLimit={10}
		showCreateButtons={true}
		initialDocuments={data.documents}
		initialFolders={data.folders}
	/>
{/if}
