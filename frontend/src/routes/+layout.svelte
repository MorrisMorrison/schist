<script lang="ts">
	import '../app.css';
	import '$lib/stores/theme.svelte';

	let { children } = $props();
</script>

{@render children()}
