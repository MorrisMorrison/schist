<script lang="ts">
	import { page } from '$app/state';
	import ThemeToggle from './ThemeToggle.svelte';
	import { BurgerIcon } from './ui/burger-icon';
	import { sidebar, sidebarActions } from '$lib/stores/sidebar.svelte';
	import { Settings, Search, LogOut, User, Lock, Unlock } from '@lucide/svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { authService } from '$lib/auth/auth-service';
	import { secretStore } from '$lib/stores/secrets.svelte';
	import { passkeyStore } from '$lib/stores/passkeys.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';

	let { isSidebarOpen }: { isSidebarOpen?: boolean } = $props();

	let isMenuOpen = $state(false);
	let isUnlocking = $state(false);

	function toggleMenu() {
		isMenuOpen = !isMenuOpen;
	}

	function closeMenu() {
		isMenuOpen = false;
	}

	function openQuickSwitcher() {
		window.dispatchEvent(new CustomEvent('openQuickSwitcher'));
	}

	function handleLogout() {
		authService.logout();
		closeMenu();
	}

	async function handleQuickUnlock() {
		if (isUnlocking) return;

		isUnlocking = true;
		try {
			// Use passkey authentication to unlock secrets
			await passkeyStore.authenticateWithPasskey();

			// Reload secrets status and secrets after unlock (same as SecretManager does)
			await secretStore.loadStatus();
			if (secretStore.secretsUnlocked && secretStore.secrets.length === 0) {
				await secretStore.loadSecrets();
			}

			// Reactive stores will handle document updates automatically
		} catch (error) {
			console.error('Quick unlock failed:', error);
			// Could show a toast error here
		} finally {
			isUnlocking = false;
		}
	}

	$effect(() => {
		if (page.url) {
			isMenuOpen = false;
		}
	});

	// Load secrets status on mount and whenever the auth state changes
	$effect(() => {
		if (authStore.user) {
			secretStore.loadStatus();
		}
	});
</script>

<nav class="border-primary bg-primary sticky top-0 z-50 border-b shadow-sm transition-colors">
	<div class="relative">
		<div class="absolute top-1/2 left-4 z-10 -translate-y-1/2 transform">
			<BurgerIcon
				isOpen={sidebar.isOpen}
				onClick={sidebarActions.toggle}
				size="lg"
				class="text-muted-foreground hover:text-foreground"
			/>
		</div>

		<div
			class="mx-auto ml-6 max-w-none px-4 pl-16 transition-colors duration-300 ease-in-out sm:px-6 lg:px-8"
			class:md:ml-[280px]={isSidebarOpen}
		>
			<div class="flex h-16 justify-between">
				<div class="flex items-center">
					<div class="flex-shrink-0">
						<a href="/" class="flex items-center">
							<img src="/icon-128x128.png" alt="Schist Logo" class="h-10 w-10 object-contain" />
							<span class="text-foreground text-xl font-semibold tracking-tight">Schist</span>
						</a>
					</div>

					<div class="hidden md:ml-6 md:flex md:space-x-6">
						<a
							href="/"
							class="inline-flex items-center border-b-2 px-1 pt-1 text-sm font-medium no-underline transition-colors {page
								.url.pathname === '/' || page.url.pathname.startsWith('/folders')
								? 'text-primary border-blue-500'
								: 'text-secondary border-transparent hover:border-gray-300 hover:text-white'}"
							data-testid="nav-home"
						>
							Home
						</a>
						<a
							href="/recent"
							class="inline-flex items-center border-b-2 px-1 pt-1 text-sm font-medium no-underline transition-colors {page
								.url.pathname === '/recent'
								? 'text-primary border-blue-500'
								: 'text-secondary border-transparent hover:border-gray-300 hover:text-white'}"
							data-testid="nav-recent"
						>
							Recent
						</a>
					</div>
				</div>

				<div class="flex-1"></div>

				<div class="flex items-center space-x-4">
					<!-- 1. Search -->
					<div class="hidden md:block">
						<button
							type="button"
							onclick={openQuickSwitcher}
							class="bg-secondary hover:bg-accent text-muted-foreground hover:text-foreground flex w-64 items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors"
							title="Quick search (⌘K)"
							aria-label="Open quick search for documents"
							data-testid="quick-switcher-button"
						>
							<Search class="h-4 w-4" />
							<span class="flex-1 text-left">Search documents...</span>
							<kbd
								class="bg-muted text-muted-foreground pointer-events-none rounded border px-1.5 py-0.5 font-mono text-xs"
								>⌘K</kbd
							>
						</button>
					</div>

					<!-- 2. Theme Toggle -->
					<ThemeToggle />

					<!-- 3. Secret Lock Toggle Button -->
					{#if authStore.user && !secretStore.secretsUnlocked}
						<button
							type="button"
							onclick={handleQuickUnlock}
							class="cursor-pointer rounded-md border border-orange-300 bg-orange-50 p-2 text-orange-600 transition-colors hover:bg-orange-100 hover:text-orange-700 focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:outline-none dark:border-orange-700 dark:bg-orange-900/20 dark:text-orange-400 dark:hover:bg-orange-900/30"
							title="Quick unlock secrets"
							aria-label="Unlock secrets using passkey authentication"
							disabled={isUnlocking}
							data-testid="quick-unlock-button"
						>
							{#if isUnlocking}
								<LoadingSpinner size="sm" />
							{:else}
								<Lock class="h-4 w-4" />
							{/if}
						</button>
					{:else if authStore.user && secretStore.secretsUnlocked}
						<!-- Show unlocked indicator -->
						<div
							class="rounded-md border border-green-300 bg-green-50 p-2 text-green-600 dark:border-green-700 dark:bg-green-900/20 dark:text-green-400"
							title="Secrets unlocked"
							data-testid="secrets-unlocked-indicator"
						>
							<Unlock class="h-4 w-4" />
						</div>
					{/if}

					<!-- 4. Settings Button -->
					<a
						href="/settings"
						class="border-secondary bg-primary text-primary hover:bg-gray-hover cursor-pointer rounded-md border p-2 transition-colors focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
						title="Settings"
					>
						<Settings class="h-4 w-4" />
					</a>

					<!-- 5. Username + Logout Button (Last) -->
					{#if authStore.user}
						<div class="hidden md:flex md:items-center md:gap-2">
							<span
								class="text-muted-foreground flex items-center gap-1 text-sm"
								data-testid="user-info"
							>
								<User class="h-4 w-4" />
								{authStore.user.username}
							</span>
							<button
								type="button"
								onclick={handleLogout}
								class="border-secondary bg-primary text-primary hover:bg-destructive hover:text-destructive-foreground cursor-pointer rounded-md border p-2 transition-colors focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
								title="Logout"
								aria-label="Sign out of your account"
								data-testid="logout-button"
							>
								<LogOut class="h-4 w-4" />
							</button>
						</div>
					{/if}

					<button
						type="button"
						onclick={toggleMenu}
						class="text-muted hover:bg-gray-hover hover:text-secondary focus:bg-gray-hover focus:text-secondary inline-flex cursor-pointer items-center justify-center rounded-md p-2 focus:outline-none md:hidden"
						aria-expanded={isMenuOpen}
						aria-label="Toggle navigation menu"
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

		{#if isMenuOpen}
			<div class="md:hidden">
				<div class="border-primary space-y-1 border-t pt-2 pb-3">
					<div class="px-4 pb-3">
						<button
							type="button"
							onclick={() => {
								openQuickSwitcher();
								closeMenu();
							}}
							class="bg-secondary hover:bg-accent text-muted-foreground hover:text-foreground flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors"
							data-testid="quick-switcher-button-mobile"
						>
							<Search class="h-4 w-4" />
							<span class="flex-1 text-left">Search documents...</span>
							<kbd
								class="bg-muted text-muted-foreground pointer-events-none rounded border px-1.5 py-0.5 font-mono text-xs"
								>⌘K</kbd
							>
						</button>
					</div>

					<!-- Quick unlock button for mobile -->
					{#if authStore.user && !secretStore.secretsUnlocked}
						<div class="px-4 pb-3">
							<button
								type="button"
								onclick={() => {
									handleQuickUnlock();
									closeMenu();
								}}
								class="flex w-full items-center space-x-2 text-left text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300"
								disabled={isUnlocking}
								data-testid="quick-unlock-button-mobile"
							>
								{#if isUnlocking}
									<LoadingSpinner size="sm" />
								{:else}
									<Lock class="h-4 w-4" />
								{/if}
								<span class="text-sm">Unlock Secrets</span>
							</button>
						</div>
					{:else if authStore.user && secretStore.secretsUnlocked}
						<div class="px-4 pb-3">
							<div class="flex items-center space-x-2 text-green-600 dark:text-green-400">
								<Unlock class="h-4 w-4" />
								<span class="text-sm">Secrets Unlocked</span>
							</div>
						</div>
					{/if}

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

					<div class="px-4 pb-3">
						<ThemeToggle />
					</div>

					{#if authStore.user}
						<!-- User info and logout (mobile) -->
						<div class="border-border border-t pt-3 pb-3">
							<div class="px-4 pb-2">
								<div
									class="text-muted-foreground flex items-center gap-2 text-sm"
									data-testid="user-info-mobile"
								>
									<User class="h-4 w-4" />
									<span>Signed in as <strong>{authStore.user.username}</strong></span>
								</div>
							</div>
							<div class="px-4">
								<button
									type="button"
									onclick={handleLogout}
									class="text-destructive hover:text-destructive/80 flex w-full items-center gap-2 text-sm"
									data-testid="logout-button-mobile"
								>
									<LogOut class="h-4 w-4" />
									<span>Sign Out</span>
								</button>
							</div>
						</div>
					{/if}

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
						data-testid="nav-recent-mobile"
					>
						Recent
					</a>
				</div>
			</div>
		{/if}
	</div>
</nav>
