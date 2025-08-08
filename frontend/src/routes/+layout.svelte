<script lang="ts">
	import '../app.css';
	import '$lib/stores/theme.js';

	let { children } = $props();
</script>

{@render children()}
