<script lang="ts">
	import '../app.css';
	import Navigation from '$lib/components/Navigation.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';

	// Import theme store to initialize
	import '$lib/stores/theme.js';

	let { children } = $props();

	// Extract current page slug from URL for edit button
	const currentPageSlug = $derived($page.params?.slug);

	// Show sidebar on pages routes
	const showSidebar = $derived($page.url.pathname.startsWith('/pages'));

	// Ensure theme is initialized on mount
	onMount(() => {
		// Theme initialization is handled in the store
	});
</script>

<div class="min-h-screen bg-gray-50 transition-colors dark:bg-gray-900">
	<Navigation {currentPageSlug} />

	<div class="app-container">
		{#if showSidebar}
			<Sidebar />
		{/if}
		
		<main class="main-content">
			{@render children()}
		</main>
	</div>
</div>

<style>
	.app-container {
		display: flex;
		height: calc(100vh - 4rem); /* Adjust based on navigation height */
	}

	.main-content {
		flex: 1;
		overflow-y: auto;
		padding: 1rem;
	}

	@media (max-width: 768px) {
		.app-container {
			flex-direction: column;
			height: auto;
		}
		
		.main-content {
			padding: 0.5rem;
		}
	}
</style>
