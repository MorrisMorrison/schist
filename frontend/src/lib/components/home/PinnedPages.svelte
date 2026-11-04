<script lang="ts">
	import { ChevronRight, FileText, Pin } from '@lucide/svelte';
	import { cn } from '#lib/utils.ts';
	import { pinnedDocuments } from '#lib/utils/pins.ts';
	import { sidebarNameClass } from '#lib/stores/settings.svelte.ts';
	import type { DocumentSummary } from '#lib/api/types.ts';

	interface Props {
		documents: readonly DocumentSummary[];
		/** Path of the page that's open, to mark it. */
		currentPath: string;
	}

	let { documents, currentPath }: Props = $props();

	const STORAGE_KEY = 'sidebar-pinned-collapsed';
	let collapsed = $state(readCollapsed());

	function readCollapsed(): boolean {
		try {
			return localStorage.getItem(STORAGE_KEY) === 'true';
		} catch {
			return false;
		}
	}

	function toggle() {
		collapsed = !collapsed;
		try {
			localStorage.setItem(STORAGE_KEY, String(collapsed));
		} catch {
			// Only a convenience: the group still works without storage.
		}
	}

	const pins = $derived(pinnedDocuments(documents));
</script>

<!-- Shown at the top of the page tree, styled like a folder of the tree: a
     "Pinned" row, with the pinned pages as file rows below it. -->
{#if pins.length > 0}
	<div class="px-2 pt-2" data-testid="sidebar-pinned">
		<button
			type="button"
			class="text-foreground hover:bg-accent flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm"
			aria-expanded={!collapsed}
			onclick={toggle}
		>
			<ChevronRight
				class={cn('text-muted-foreground size-3 transition-transform', !collapsed && 'rotate-90')}
			/>
			<Pin class="text-primary size-4" />
			<span class="flex-1 text-left">Pinned</span>
			<span class="text-muted-foreground text-xs">{pins.length}</span>
		</button>
		{#if !collapsed}
			<ul class="space-y-1">
				{#each pins as document (document.metaData.path)}
					{@const isCurrent = document.metaData.path === currentPath}
					<li>
						<a
							href={`/documents${document.metaData.path}`}
							data-testid="sidebar-pinned-link"
							aria-current={isCurrent ? 'page' : undefined}
							title={document.metaData.title}
							class={cn(
								'text-foreground hover:bg-accent flex items-center gap-2 rounded-md py-1.5 pr-2 pl-7 text-sm no-underline hover:no-underline',
								isCurrent &&
									'bg-[var(--nav-active)] font-medium shadow-[inset_2px_0_0_var(--primary)]'
							)}
							><FileText class="text-muted-foreground size-4 shrink-0" /><span
								class={cn('min-w-0', sidebarNameClass())}>{document.metaData.title}</span
							></a
						>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
{/if}
