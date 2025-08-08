<script lang="ts">
	import '../../../app.css';
	import '$lib/stores/theme.js';

	let { children } = $props();
</script>

<svelte:head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title>Shared Document</title>
</svelte:head>

<div class="share-app bg-background text-foreground">
	{@render children()}
</div>

<style>
	.share-app {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		width: 100vw;
		margin: 0;
		padding: 0;
	}
</style>
