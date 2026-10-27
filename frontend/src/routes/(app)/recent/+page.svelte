<script lang="ts">
	import { PageContainer } from '#lib/components/ui/page-container/index.ts';
	import FolderView from '#lib/components/folder/FolderView.svelte';
	import { Alert, AlertDescription, AlertTitle } from '#lib/components/ui/alert/index.ts';
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
	<PageContainer width="wide">
		<Alert variant="destructive" class="border-destructive">
			<AlertTitle>Error loading documents</AlertTitle>
			<AlertDescription>{data.loadError}</AlertDescription>
		</Alert>
	</PageContainer>
{:else}
	<FolderView
		mode="recent"
		recentLimit={10}
		showCreateButtons={true}
		initialDocuments={data.documents}
		initialFolders={data.folders}
	/>
{/if}
