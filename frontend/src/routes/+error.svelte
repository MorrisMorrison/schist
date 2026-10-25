<script lang="ts">
	import { page } from '$app/state';
	import { House, Plus, RefreshCw } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';

	const status = $derived(page.status);
	const message = $derived(page.error?.message);
	const slug = $derived(page.url.pathname.split('/').pop() || '');
</script>

<svelte:head>
	<title>{status} - Schist Wiki</title>
</svelte:head>

<div class="flex min-h-[50vh] items-center justify-center">
	<div class="text-center">
		<div class="mx-auto max-w-md">
			{#if status === 404}
				<svg
					class="mx-auto h-24 w-24 text-(--muted-foreground)"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z"
					/>
				</svg>

				<h1 class="mt-6 text-3xl font-bold text-(--foreground)">Page Not Found</h1>

				{#if slug}
					<p class="mt-4 text-(--muted-foreground)">
						The page <span class="font-mono font-medium">"{slug}"</span> doesn't exist yet.
					</p>

					<div
						class="mt-8 flex flex-col items-center space-y-4 sm:flex-row sm:justify-center sm:space-y-0 sm:space-x-4"
					>
						<Button href="/new?title={encodeURIComponent(slug.replace(/-/g, ' '))}">
							<Plus />
							Create This Page
						</Button>

						<Button href="/" variant="secondary">
							<House />
							Go Home
						</Button>
					</div>
				{:else}
					<p class="mt-4 text-(--muted-foreground)">
						{message || "The page you are looking for doesn't exist."}
					</p>

					<div class="mt-8">
						<Button href="/">
							<House />
							Go Home
						</Button>
					</div>
				{/if}
			{:else}
				<svg
					class="mx-auto h-24 w-24 text-(--destructive)"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
					/>
				</svg>

				<h1 class="mt-6 text-3xl font-bold text-(--foreground)">
					{status} Error
				</h1>

				<p class="mt-4 text-(--muted-foreground)">
					{message || 'Something went wrong. Please try again later.'}
				</p>

				<div class="mt-8 flex justify-center space-x-4">
					<Button onclick={() => window.location.reload()}>
						<RefreshCw />
						Try Again
					</Button>

					<Button href="/" variant="secondary">
						<House />
						Go Home
					</Button>
				</div>
			{/if}
		</div>
	</div>
</div>
