<script lang="ts">
	import FolderView from '$lib/components/folder/FolderView.svelte';
</script>

<svelte:head>
	<title>Schist Wiki</title>
	<meta name="description" content="A lightweight, fast wiki for your documentation needs" />
</svelte:head>

<FolderView path="" showCreateButtons={true} />
