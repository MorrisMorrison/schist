<script lang="ts">
	import '../app.css';
	import Navigation from '$lib/components/Navigation.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import { page } from '$app/state';
	import { onMount } from 'svelte';

	// Import theme store to initialize
	import '$lib/stores/theme.js';
	// Import sidebar store
	import { sidebarOpen, sidebarActions } from '$lib/stores/sidebar';

	let { children } = $props();

	// Always allow sidebar to be shown - let users decide with the toggle
	const showSidebarComponent = true;

	// Combined logic: show sidebar if route allows it AND store says it's open
	const sidebarVisible = $derived(showSidebarComponent && $sidebarOpen);

	// Close sidebar on mobile when navigating
	$effect(() => {
		if (page.url) {
			sidebarActions.closeOnMobile();
		}
	});

	// Ensure theme is initialized on mount
	onMount(() => {
		// Theme initialization is handled in the store
	});

	// Handle backdrop click on mobile
	function handleBackdropClick() {
		if (window.innerWidth < 768 && $sidebarOpen) {
			sidebarActions.close();
		}
	}
</script>

<div class="bg-background min-h-screen border-0 transition-colors">
	<Navigation isSidebarOpen={$sidebarOpen} />

	<div class="app-container border-0" class:with-sidebar={sidebarVisible}>
		<!-- Mobile backdrop -->
		{#if showSidebarComponent && $sidebarOpen}
			<div
				class="fixed inset-0 z-10 bg-black/50 md:hidden"
				onclick={handleBackdropClick}
				onkeydown={(e) => {
					if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
						handleBackdropClick();
					}
				}}
				role="button"
				tabindex="-1"
				aria-label="Close sidebar"
			></div>
		{/if}

		<!-- Sidebar -->
		{#if showSidebarComponent}
			<div class="sidebar-container {$sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}">
				<Sidebar />
			</div>
		{/if}

		<main class="main-content bg-background" class:sidebar-open={sidebarVisible}>
			{@render children()}
		</main>
	</div>
</div>

<style>
	.app-container {
		display: flex;
		height: calc(100vh - 4rem); /* Adjust based on navigation height */
		position: relative;
	}

	.sidebar-container {
		width: 280px; /* w-70 = 17.5rem = 280px */
		height: 100%;
		transition: transform 0.3s ease-in-out;
		z-index: 20;
	}

	/* Desktop sidebar behavior */
	@media (min-width: 768px) {
		.sidebar-container.sidebar-closed {
			transform: translateX(-100%);
			margin-left: -280px;
		}

		.sidebar-container.sidebar-open {
			transform: translateX(0);
			margin-left: 0;
		}
	}

	/* Mobile sidebar behavior - overlay */
	@media (max-width: 767px) {
		.sidebar-container {
			position: fixed;
			top: 4rem; /* Navigation height */
			left: 0;
			background: var(--color-primary);
			border-right: 1px solid var(--color-border);
			box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
		}

		.sidebar-container.sidebar-closed {
			transform: translateX(-100%);
		}

		.sidebar-container.sidebar-open {
			transform: translateX(0);
		}
	}

	.main-content {
		flex: 1;
		padding: 2rem;
		transition: all 0.3s ease-in-out;
	}

	/* Only add overflow when sidebar is visible */
	.main-content.sidebar-open {
		overflow-y: auto;
	}

	/* When sidebar is not shown, center the content with max-width */
	.app-container:not(.with-sidebar) .main-content {
		max-width: 1200px;
		margin: 0 auto;
	}

	/* Mobile styles */
	@media (max-width: 767px) {
		.app-container {
			flex-direction: column;
			height: auto;
		}

		.main-content {
			padding: 0.5rem;
			/* On mobile, main content always takes full width */
			width: 100%;
		}
	}
</style>
