<script lang="ts">
	import '../../app.css';

	import '$lib/stores/theme.js';

	let { children } = $props();
</script>

<svelte:head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
</svelte:head>

<div class="login-app">
	{@render children()}
</div>

<style>
	.login-app {
		/* Ensure this page is completely isolated */
		width: 100vw;
		height: 100vh;
		margin: 0;
		padding: 0;
		/* Reset any inherited styles */
		position: relative;
		overflow: hidden;
	}
</style>
