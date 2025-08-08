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

<div class="share-app">
	{@render children()}
</div>

<style>
	.share-app {
		width: 100vw;
		height: 100vh;
		margin: 0;
		padding: 2rem;
		background: #0a0a0a;
		color: #fafafa;
		overflow: auto;
	}
</style>
