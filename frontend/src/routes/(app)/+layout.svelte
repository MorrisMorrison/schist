<script lang="ts">
	import '../../app.css';
	import Navigation from '$lib/components/Navigation.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import QuickSwitcher from '$lib/components/QuickSwitcher.svelte';
	import KeyboardShortcutsModal from '$lib/components/modal/KeyboardShortcutsModal.svelte';
	import WorkspaceIndicator from '$lib/components/WorkspaceIndicator.svelte';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import {
		createKeyboardShortcutHandler,
		type KeyboardShortcutHandlers
	} from '$lib/utils/keyboard-shortcuts';

	import '$lib/stores/theme.svelte';
	import { sidebar, sidebarActions } from '$lib/stores/sidebar.svelte';
	import { authService } from '$lib/auth/auth-service';
	import { authStore } from '$lib/stores/auth.svelte';
	import { apiClient } from '$lib/api/client';
	import { goto } from '$app/navigation';

	let { children } = $props();

	let quickSwitcherOpen = $state(false);
	let keyboardShortcutsOpen = $state(false);

	const isPublicRoute = $derived(
		page.route.id === '/login' || page.route.id === null || page.route.id?.startsWith('/share/')
	);

	const showSidebarComponent = $derived(
		isPublicRoute || !authService.isAuthEnabled() || (authStore.token && authStore.user)
	);

	const sidebarVisible = $derived(showSidebarComponent && sidebar.isOpen);

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

	function handleCreateFolder() {
		window.dispatchEvent(new CustomEvent('openCreateFolderModal'));
	}

	function handleDeleteDocument(event: Event) {
		const customEvent = event as CustomEvent<{ path: string }>;
		if (confirm(`Are you sure you want to delete this document?`)) {
			apiClient
				.deleteDocumentByPath(customEvent.detail.path)
				.then(() => {
					goto('/');
				})
				.catch((error) => {
					console.error('Failed to delete document:', error);
					alert('Failed to delete document. Please try again.');
				});
		}
	}

	function handleDownloadDocument(event: Event) {
		const customEvent = event as CustomEvent<{ path: string }>;
		apiClient.exportDocument(customEvent.detail.path);
	}

	onMount(() => {
		authService.initialize();

		document.addEventListener('keydown', handleGlobalKeydown);
		window.addEventListener('openQuickSwitcher', handleOpenQuickSwitcher);
		window.addEventListener('createFolder', handleCreateFolder);
		window.addEventListener('deleteDocument', handleDeleteDocument);
		window.addEventListener('downloadDocument', handleDownloadDocument);

		return () => {
			document.removeEventListener('keydown', handleGlobalKeydown);
			window.removeEventListener('openQuickSwitcher', handleOpenQuickSwitcher);
			window.removeEventListener('createFolder', handleCreateFolder);
			window.removeEventListener('deleteDocument', handleDeleteDocument);
			window.removeEventListener('downloadDocument', handleDownloadDocument);
		};
	});

	$effect(() => {
		if (!isPublicRoute && !authStore.token && authService.isAuthEnabled()) {
			authService.requireAuth(page.url.pathname + page.url.search);
		}
	});

	function handleBackdropClick() {
		if (window.innerWidth < 768 && sidebar.isOpen) {
			sidebarActions.close();
		}
	}
</script>

<div class="bg-background flex min-h-screen flex-col border-0 transition-colors">
	<Navigation isSidebarOpen={sidebar.isOpen} />

	<div class="app-container flex-1 border-0" class:with-sidebar={sidebarVisible}>
		<!-- Mobile backdrop -->
		{#if showSidebarComponent && sidebar.isOpen}
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
			<div
				class="sidebar-container {sidebar.isOpen ? 'sidebar-open' : 'sidebar-closed'}"
				data-testid="sidebar"
			>
				<Sidebar />
			</div>
		{/if}

		<main class="main-content bg-background" class:sidebar-open={sidebarVisible}>
			{@render children()}
		</main>
	</div>

	<!-- Footer -->
	<footer class="border-border bg-background sticky bottom-0 z-40 border-t px-4 py-3">
		<div class="flex items-center justify-between">
			<!-- Left: Workspace Indicator -->
			<div class="flex-1">
				<WorkspaceIndicator />
			</div>

			<!-- Center: Keyboard Shortcuts -->
			<button
				type="button"
				onclick={() => (keyboardShortcutsOpen = true)}
				class="text-muted-foreground hover:text-foreground text-sm underline-offset-4 transition-colors hover:underline"
			>
				⌨️ Keyboard Shortcuts
			</button>

			<!-- Right: Empty space for balance -->
			<div class="flex-1"></div>
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
		min-height: calc(100vh - 4rem - 4rem); /* Viewport height minus nav (4rem) and footer (4rem) */
		position: relative;
	}

	.sidebar-container {
		width: 280px; /* w-70 = 17.5rem = 280px */
		height: calc(100vh - 4rem - 4rem); /* Full viewport height minus navigation and footer */
		position: sticky;
		top: 4rem; /* Height of navigation */
		transition: transform 0.3s ease-in-out;
		z-index: 20;
	}

	/* Desktop sidebar behavior - dynamic space allocation based on sidebar visibility */
	@media (min-width: 768px) {
		.app-container.with-sidebar {
			padding-left: 280px; /* Reserve space only when sidebar is visible */
		}

		.app-container:not(.with-sidebar) {
			padding-left: 0; /* Use full width when sidebar is hidden */
		}

		.sidebar-container {
			position: fixed; /* Use fixed positioning to overlay the reserved space */
			left: 0;
			top: 4rem;
		}

		.sidebar-container.sidebar-closed {
			opacity: 0;
			pointer-events: none;
			transform: translateX(-100%);
		}

		.sidebar-container.sidebar-open {
			opacity: 1;
			pointer-events: auto;
			transform: translateX(0);
		}
	}

	/* Mobile sidebar behavior - overlay */
	@media (max-width: 767px) {
		.app-container {
			padding-left: 0; /* No reserved space on mobile */
		}

		.sidebar-container {
			position: fixed;
			top: 4rem; /* Navigation height */
			left: 0;
			height: calc(100vh - 4rem - 4rem); /* Full viewport height minus navigation and footer */
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
		min-height: 0; /* Allow flex item to shrink */
		overflow-y: auto; /* Enable scrolling when content exceeds container */
		max-width: 100%; /* Ensure content doesn't overflow */
	}

	/* Mobile styles */
	@media (max-width: 767px) {
		.main-content {
			padding: 0.5rem;
			/* On mobile, main content always takes full width */
			width: 100%;
		}
	}
</style>
