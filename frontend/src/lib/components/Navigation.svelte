<script lang="ts">
	import { page } from '$app/stores';
	import SearchBox from './SearchBox.svelte';

	let { currentPageSlug }: { currentPageSlug?: string } = $props();

	let isMenuOpen = $state(false);

	function toggleMenu() {
		isMenuOpen = !isMenuOpen;
	}

	function closeMenu() {
		isMenuOpen = false;
	}

	// Close menu when route changes
	$effect(() => {
		if ($page.url) {
			isMenuOpen = false;
		}
	});
</script>

<nav class="border-b border-gray-200 bg-white shadow-sm">
	<div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
		<div class="flex h-16 justify-between">
			<!-- Left side - Logo and main navigation -->
			<div class="flex items-center">
				<div class="flex-shrink-0">
					<a href="/" class="flex items-center space-x-2">
						<svg
							class="h-8 w-8 text-blue-600"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
							/>
						</svg>
						<span class="text-xl font-bold text-gray-900">Schist</span>
					</a>
				</div>

				<!-- Desktop navigation -->
				<div class="hidden md:ml-6 md:flex md:space-x-8">
					<a
						href="/"
						class="inline-flex items-center border-b-2 px-1 pt-1 text-sm font-medium transition-colors {$page
							.url.pathname === '/'
							? 'border-blue-500 text-gray-900'
							: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
					>
						Home
					</a>
					<a
						href="/pages"
						class="inline-flex items-center border-b-2 px-1 pt-1 text-sm font-medium transition-colors {$page
							.url.pathname === '/pages'
							? 'border-blue-500 text-gray-900'
							: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
					>
						All Pages
					</a>
				</div>
			</div>

			<!-- Center - Search (desktop) -->
			<div class="hidden md:flex md:flex-1 md:items-center md:justify-center md:px-2">
				<div class="w-full max-w-lg">
					<SearchBox placeholder="Search pages..." />
				</div>
			</div>

			<!-- Right side - Actions -->
			<div class="flex items-center space-x-4">
				<!-- Create new page button -->
				<a
					href="/new"
					class="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus:bg-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
				>
					<svg class="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 4v16m8-8H4"
						/>
					</svg>
					New Page
				</a>

				<!-- Edit current page button (if on a page) -->
				{#if currentPageSlug && $page.url.pathname !== '/new' && !$page.url.pathname.startsWith('/edit/')}
					<a
						href="/edit/{currentPageSlug}"
						class="inline-flex items-center rounded-md bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 focus:bg-gray-200 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:outline-none"
					>
						<svg class="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
							/>
						</svg>
						Edit
					</a>
				{/if}

				<!-- Mobile menu button -->
				<button
					type="button"
					onclick={toggleMenu}
					class="inline-flex items-center justify-center rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-500 focus:bg-gray-100 focus:text-gray-500 focus:outline-none md:hidden"
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
			<div class="space-y-1 border-t border-gray-200 pt-2 pb-3">
				<!-- Mobile search -->
				<div class="px-4 pb-3">
					<SearchBox placeholder="Search pages..." />
				</div>

				<!-- Mobile navigation links -->
				<a
					href="/"
					onclick={closeMenu}
					class="block border-l-4 py-2 pr-4 pl-3 text-base font-medium {$page.url.pathname === '/'
						? 'border-blue-500 bg-blue-50 text-blue-700'
						: 'border-transparent text-gray-500 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-700'}"
				>
					Home
				</a>
				<a
					href="/pages"
					onclick={closeMenu}
					class="block border-l-4 py-2 pr-4 pl-3 text-base font-medium {$page.url.pathname ===
					'/pages'
						? 'border-blue-500 bg-blue-50 text-blue-700'
						: 'border-transparent text-gray-500 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-700'}"
				>
					All Pages
				</a>
			</div>
		</div>
	{/if}
</nav>
