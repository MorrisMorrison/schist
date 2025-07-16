<script lang="ts">
	import '../app.css';
	import Navigation from '$lib/components/Navigation.svelte';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';

	// Import theme store to initialize
	import '$lib/stores/theme.js';

	let { children } = $props();

	// Extract current page slug from URL for edit button
	const currentPageSlug = $derived($page.params?.slug);

	// Ensure theme is initialized on mount
	onMount(() => {
		// Theme initialization is handled in the store
	});
</script>

<div class="min-h-screen bg-gray-50 transition-colors dark:bg-gray-900">
	<Navigation {currentPageSlug} />

	<main class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
		{@render children()}
	</main>
</div>
