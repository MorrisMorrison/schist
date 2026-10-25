<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import { ChevronRight, Home } from '@lucide/svelte';

	let { path = '', currentDocumentTitle = '' }: { path?: string; currentDocumentTitle?: string } =
		$props();

	const segments = $derived.by(() => {
		let rawSegments = path.split('/').filter((segment) => segment !== '');
		const isDocumentPath = page.url.pathname.includes('documents');
		if (isDocumentPath && rawSegments.length > 0) {
			rawSegments = rawSegments.slice(0, -1);
		}
		return rawSegments.map((segment, index, array) => {
			const fullPath = '/' + array.slice(0, index + 1).join('/');
			return {
				name: segment,
				path: fullPath,
				isLast: index === array.length - 1
			};
		});
	});

	function navigateToPath(targetPath: string) {
		if (targetPath === '/') {
			goto('/folders');
		} else {
			goto(`/folders${targetPath}`);
		}
	}
</script>

<nav class="mb-2" aria-label="Breadcrumb navigation" data-testid="breadcrumbs">
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
				<Button
					variant="ghost"
					size="sm"
					class="text-secondary hover:text-primary h-8 px-2"
					onclick={() => navigateToPath(segment.path)}
					aria-label="Go to {segment.name}"
				>
					{segment.name}
				</Button>
			</li>
		{/each}

		<!-- Current page title if different from path -->
		{#if currentDocumentTitle && currentDocumentTitle !== segments[segments.length - 1]?.name}
			<li class="flex items-center gap-1">
				<ChevronRight class="text-muted h-4 w-4 flex-shrink-0" />
				<span class="text-primary px-2 py-1 text-sm font-medium" aria-current="page">
					{currentDocumentTitle}
				</span>
			</li>
		{/if}
	</ol>
</nav>
