<script lang="ts">
	// Self-hosted fonts (bundled by Vite, so they work under the CSP's font-src 'self').
	import '@fontsource-variable/inter';
	import '@fontsource-variable/jetbrains-mono';
	import '../app.css';
	import '#lib/stores/theme.svelte.ts';

	let { children } = $props();
</script>

{@render children()}
