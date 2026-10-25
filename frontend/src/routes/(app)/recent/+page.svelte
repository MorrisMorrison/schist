<script lang="ts">
	import FolderView from '$lib/components/folder/FolderView.svelte';
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
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
		<Alert variant="destructive" class="border-destructive">
			<AlertTitle>Error loading documents</AlertTitle>
			<AlertDescription>{data.loadError}</AlertDescription>
		</Alert>
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
