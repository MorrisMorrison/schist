<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import { ChevronRight, Home } from 'lucide-svelte';

	export let path: string = '';
	export let currentPageTitle: string = '';
	let segments: Array<{ name: string; path: string; isLast: boolean }> = [];
	// Build breadcrumb segments from path
	$: {
		let rawSegments = path.split('/').filter((segment) => segment !== '');
		const isPagePath = page.url.pathname.includes('pages');
		if (isPagePath && rawSegments.length > 0) {
			rawSegments = rawSegments.slice(0, -1); // remove last element
		}
		segments = rawSegments.map((segment, index, array) => {
			const fullPath = '/' + array.slice(0, index + 1).join('/');
			return {
				name: segment.charAt(0) + segment.slice(1),
				path: fullPath,
				isLast: index === array.length - 1
			};
		});
	}

	// Handle navigation to folder/path
	function navigateToPath(targetPath: string) {
		if (targetPath === '/') {
			goto('/folders');
		} else {
			goto(`/folders${targetPath}`);
		}
	}
</script>

<nav class="mb-4 border-b pb-2" aria-label="Breadcrumb navigation" data-testid="breadcrumbs">
	<ol class="m-0 flex list-none flex-wrap items-center gap-1 p-0">
		<!-- Home/Root -->
		<li class="flex items-center gap-1">
			<Button
				variant="ghost"
				size="sm"
				class="flex h-8 items-center gap-1 px-2"
				onclick={() => navigateToPath('/')}
				aria-label="Go to home"
			>
				<Home class="h-4 w-4" />
				<span>Home</span>
			</Button>
		</li>

		<!-- Path segments -->
		{#each segments as segment (segment.path)}
			<li class="flex items-center gap-1">
				<ChevronRight class="text-muted h-4 w-4 flex-shrink-0" />
				<!-- {#if segment.isLast}
					<span class="text-primary px-2 py-1 text-sm font-medium" aria-current="page">
						{segment.name}
					</span>
				{:else} -->
					<Button
						variant="ghost"
						size="sm"
						class="text-secondary hover:text-primary h-8 px-2"
						onclick={() => navigateToPath(segment.path)}
						aria-label="Go to {segment.name}"
					>
						{segment.name}
					</Button>
				<!-- {/if} -->
			</li>
		{/each}

		<!-- Current page title if different from path -->
		{#if currentPageTitle && currentPageTitle !== segments[segments.length - 1]?.name}
			<li class="flex items-center gap-1">
				<ChevronRight class="text-muted h-4 w-4 flex-shrink-0" />
				<span class="text-primary px-2 py-1 text-sm font-medium" aria-current="page">
					{currentPageTitle}
				</span>
			</li>
		{/if}
	</ol>
</nav>
