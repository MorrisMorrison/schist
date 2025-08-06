<script lang="ts">
	import '../app.css';
	import Navigation from '$lib/components/Navigation.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import QuickSwitcher from '$lib/components/QuickSwitcher.svelte';
	import KeyboardShortcutsModal from '$lib/components/KeyboardShortcutsModal.svelte';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import {
		createKeyboardShortcutHandler,
		type KeyboardShortcutHandlers
	} from '$lib/utils/keyboard-shortcuts';

	import '$lib/stores/theme.js';
	import { sidebarOpen, sidebarActions } from '$lib/stores/sidebar';
	import { authService } from '$lib/auth/auth-service';
	import { authStore } from '$lib/stores/auth';
	import { browser } from '$app/environment';

	let { children } = $props();

	let quickSwitcherOpen = $state(false);
	let keyboardShortcutsOpen = $state(false);

	const isPublicRoute = $derived(page.route.id === '/login' || page.route.id === null);

	const showSidebarComponent = $derived(isPublicRoute || !authService.isAuthEnabled() || ($authStore.token && $authStore.user));

	const sidebarVisible = $derived(showSidebarComponent && $sidebarOpen);

	$effect(() => {
		if (page.url) {
			sidebarActions.closeOnMobile();
		}
	});

	const keyboardHandlers: KeyboardShortcutHandlers = {
		openQuickSwitcher: () => (quickSwitcherOpen = true),
		closeQuickSwitcher: () => (quickSwitcherOpen = false),
		isQuickSwitcherOpen: () => quickSwitcherOpen
	};

	const handleGlobalKeydown = createKeyboardShortcutHandler(page, keyboardHandlers);

	function handleOpenQuickSwitcher() {
		quickSwitcherOpen = true;
	}

	onMount(() => {
		authService.initialize();

		document.addEventListener('keydown', handleGlobalKeydown);
		window.addEventListener('openQuickSwitcher', handleOpenQuickSwitcher);

		return () => {
			document.removeEventListener('keydown', handleGlobalKeydown);
			window.removeEventListener('openQuickSwitcher', handleOpenQuickSwitcher);
		};
	});

	$effect(() => {
		if (browser && !isPublicRoute && !$authStore.token && authService.isAuthEnabled()) {
			authService.requireAuth(page.url.pathname + page.url.search);
		}
	});

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

	<!-- Footer -->
	<footer class="border-border bg-background border-t px-4 py-3">
		<div class="flex items-center justify-center">
			<button
				type="button"
				onclick={() => (keyboardShortcutsOpen = true)}
				class="text-muted-foreground hover:text-foreground text-sm underline-offset-4 transition-colors hover:underline"
			>
				⌨️ Keyboard Shortcuts
			</button>
		</div>
	</footer>
</div>

<QuickSwitcher open={quickSwitcherOpen} onClose={() => (quickSwitcherOpen = false)} />
<KeyboardShortcutsModal
	open={keyboardShortcutsOpen}
	onClose={() => (keyboardShortcutsOpen = false)}
/>

<style>
	.app-container {
		display: flex;
		height: calc(100vh - 4rem - 3rem); /* Navigation height + footer height */
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
