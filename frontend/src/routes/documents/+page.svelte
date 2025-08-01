<script lang="ts">
	import FolderView from '$lib/components/FolderView.svelte';
	import type { DocumentData } from './$types.js';

	let { data }: { data: DocumentData } = $props();
</script>

<svelte:head>
	<title>Pages</title>
</svelte:head>

<FolderView path="" initialDocuments={data.documents} initialFolders={data.folders} />
