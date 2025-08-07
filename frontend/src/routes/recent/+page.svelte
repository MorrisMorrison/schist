<script lang="ts">
	import FolderView from '$lib/components/folder/FolderView.svelte';
</script>

<svelte:head>
	<title>Recent Documents - Schist</title>
	<meta name="description" content="Recently updated documents in your wiki" />
</svelte:head>

<FolderView mode="recent" recentLimit={10} showCreateButtons={true} />
