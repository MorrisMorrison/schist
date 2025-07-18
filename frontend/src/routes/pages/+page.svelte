<script lang="ts">
	import FolderView from '$lib/components/FolderView.svelte';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Pages</title>
</svelte:head>

<FolderView path="" initialPages={data.pages} initialFolders={data.folders} />
