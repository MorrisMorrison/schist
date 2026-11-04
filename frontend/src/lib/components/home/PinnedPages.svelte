<script lang="ts">
	import { ChevronRight, Pin } from '@lucide/svelte';
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

{#if pins.length > 0}
	<div class="border-border border-b px-2 pt-1 pb-2" data-testid="sidebar-pinned">
		<button
			type="button"
			class="text-muted-foreground hover:text-foreground flex w-full items-center gap-1 rounded-md px-2 py-1 text-xs font-medium"
			aria-expanded={!collapsed}
			onclick={toggle}
		>
			<ChevronRight class={cn('size-3 transition-transform', !collapsed && 'rotate-90')} />
			<Pin class="text-primary size-3" />
			Pinned
		</button>
		{#if !collapsed}
			<ul class="mt-0.5">
				{#each pins as document (document.metaData.path)}
					{@const isCurrent = document.metaData.path === currentPath}
					<li>
						<a
							href={`/documents${document.metaData.path}`}
							data-testid="sidebar-pinned-link"
							aria-current={isCurrent ? 'page' : undefined}
							title={document.metaData.title}
							class={cn(
								'text-foreground hover:bg-accent block rounded-md py-1 pr-2 pl-7 text-sm no-underline hover:no-underline',
								isCurrent &&
									'bg-[var(--nav-active)] font-medium shadow-[inset_2px_0_0_var(--primary)]'
							)}><span class={cn('block', sidebarNameClass())}>{document.metaData.title}</span></a
						>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
{/if}
