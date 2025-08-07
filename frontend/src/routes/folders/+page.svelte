<script lang="ts">
	import FolderView from '$lib/components/folder/FolderView.svelte';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
</script>

<svelte:head>
	<title>All Folders - Documentation</title>
</svelte:head>

<FolderView
	path=""
	showCreateButtons={true}
	initialDocuments={data.documents}
	initialFolders={data.folders}
/>
