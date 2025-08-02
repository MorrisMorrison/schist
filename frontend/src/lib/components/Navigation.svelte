<script lang="ts">
	import { page } from '$app/state';
	import SearchBox from './SearchBox.svelte';
	import ThemeToggle from './ThemeToggle.svelte';
	import { BurgerIcon } from './ui/burger-icon';
	import { sidebarOpen, sidebarActions } from '$lib/stores/sidebar';
	import { Settings } from 'lucide-svelte';

	let { isSidebarOpen }: { isSidebarOpen?: boolean } = $props();

	let isMenuOpen = $state(false);

	const showSidebarToggle = true;

	function toggleMenu() {
		isMenuOpen = !isMenuOpen;
	}

	function closeMenu() {
		isMenuOpen = false;
	}

	$effect(() => {
		if (page.url) {
			isMenuOpen = false;
		}
	});
</script>

<nav class="border-primary bg-primary border-b shadow-sm transition-colors">
	<div class="relative">
		<div class="absolute top-1/2 left-4 z-10 -translate-y-1/2 transform">
			<BurgerIcon
				isOpen={$sidebarOpen}
				onClick={sidebarActions.toggle}
				size="lg"
				class="text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
			/>
		</div>

		<!-- Main navigation content -->
		<div
			class="mx-auto px-4 transition-all duration-300 ease-in-out sm:px-6 lg:px-8"
			class:pl-16={showSidebarToggle}
			class:md:ml-[280px]={isSidebarOpen}
			class:max-w-7xl={!isSidebarOpen}
			class:max-w-none={isSidebarOpen}
		>
			<div class="flex h-16 justify-between">
				<!-- Left side - Logo and main navigation -->
				<div class="flex items-center">
					<div class="flex-shrink-0">
						<a href="/" class="flex items-center space-x-3">
							<img src="/icon-128x128.png" alt="Schist Logo" class="h-16 w-16" />
							<span class="text-foreground text-xl font-semibold tracking-tight">Schist</span>
						</a>
					</div>

					<!-- Desktop navigation -->
					<div class="hidden md:ml-6 md:flex md:space-x-8">
						<a
							href="/"
							class="inline-flex items-center border-b-2 px-1 pt-1 text-sm font-medium no-underline transition-colors {page
								.url.pathname === '/' || page.url.pathname.startsWith('/folders')
								? 'text-primary border-blue-500'
								: 'text-secondary border-transparent hover:border-gray-300 hover:text-white'}"
						>
							Home
						</a>
						<a
							href="/recent"
							class="inline-flex items-center border-b-2 px-1 pt-1 text-sm font-medium no-underline transition-colors {page
								.url.pathname === '/recent'
								? 'text-primary border-blue-500'
								: 'text-secondary border-transparent hover:border-gray-300 hover:text-white'}"
						>
							Recent
						</a>
					</div>
				</div>

				<!-- Spacer for centering when no search -->
				<div class="flex-1"></div>

				<!-- Right side - Actions -->
				<div class="flex items-center space-x-4">
					<!-- Search box - always on the right -->
					<div class="hidden md:block">
						<div class="w-64">
							<SearchBox placeholder="Search pages..." testId="nav-search-input" />
						</div>
					</div>

					<!-- Settings Button -->
					<a
						href="/settings"
						class="text-muted hover:bg-gray-hover hover:text-secondary focus:bg-gray-hover focus:text-secondary inline-flex cursor-pointer items-center justify-center rounded-md p-2 no-underline focus:outline-none"
						title="Settings"
					>
						<Settings class="h-5 w-5" />
					</a>

					<ThemeToggle />

					<!-- Mobile menu button -->
					<button
						type="button"
						onclick={toggleMenu}
						class="text-muted hover:bg-gray-hover hover:text-secondary focus:bg-gray-hover focus:text-secondary inline-flex cursor-pointer items-center justify-center rounded-md p-2 focus:outline-none md:hidden"
						aria-expanded={isMenuOpen}
					>
						<span class="sr-only">Open main menu</span>
						<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							{#if isMenuOpen}
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M6 18L18 6M6 6l12 12"
								/>
							{:else}
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M4 6h16M4 12h16M4 18h16"
								/>
							{/if}
						</svg>
					</button>
				</div>
			</div>
		</div>

		<!-- Mobile menu -->
		{#if isMenuOpen}
			<div class="md:hidden">
				<div class="border-primary space-y-1 border-t pt-2 pb-3">
					<!-- Mobile search -->
					<div class="px-4 pb-3">
						<SearchBox placeholder="Search pages..." testId="nav-search-input" />
					</div>

					<!-- Mobile settings -->
					<div class="px-4 pb-3">
						<a
							href="/settings"
							onclick={closeMenu}
							class="text-secondary hover:text-primary flex items-center space-x-2 no-underline"
						>
							<Settings class="h-4 w-4" />
							<span class="text-sm">Settings</span>
						</a>
					</div>

					<!-- Mobile theme toggle -->
					<div class="px-4 pb-3">
						<ThemeToggle />
					</div>

					<!-- Mobile navigation links -->
					<a
						href="/"
						onclick={closeMenu}
						class="block border-l-4 py-2 pr-4 pl-3 text-base font-medium {page.url.pathname ===
							'/' || page.url.pathname.startsWith('/folders')
							? 'bg-blue-muted text-blue-primary border-blue-500'
							: 'text-secondary hover:bg-gray-hover hover:text-primary border-transparent hover:border-gray-300'}"
					>
						Home
					</a>
					<a
						href="/recent"
						onclick={closeMenu}
						class="block border-l-4 py-2 pr-4 pl-3 text-base font-medium {page.url.pathname ===
						'/recent'
							? 'bg-blue-muted text-blue-primary border-blue-500'
							: 'text-secondary hover:bg-gray-hover hover:text-primary border-transparent hover:border-gray-300'}"
					>
						Recent
					</a>
				</div>
			</div>
		{/if}
	</div>
</nav>
