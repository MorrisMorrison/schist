<script lang="ts" generics="T extends AutocompleteItem">
	import { onMount } from 'svelte';
	import type { AutocompleteItem, AutocompletePosition } from './types';

	let {
		items,
		isVisible,
		selectedIndex,
		maxItems = 10,
		emptyMessage = 'No results found',
		getItemLabel,
		getItemDetail,
		getItemInfo,
		position,
		variant = 'default',
		onSelect,
		onNavigate,
		onClose,
		class: className = ''
	}: {
		items: T[];
		isVisible: boolean;
		selectedIndex: number;
		maxItems?: number;
		emptyMessage?: string;
		getItemLabel: (item: T) => string;
		getItemDetail?: (item: T) => string | undefined;
		getItemInfo?: (item: T) => string | undefined;
		position?: AutocompletePosition;
		variant?: 'default' | 'compact';
		onSelect: (item: T) => void;
		onNavigate?: (index: number) => void;
		onClose: () => void;
		class?: string;
	} = $props();

	const visibleItems = $derived(items.slice(0, maxItems));
	const hasItems = $derived(visibleItems.length > 0);
	const safeSelectedIndex = $derived(Math.max(0, Math.min(selectedIndex, visibleItems.length - 1)));

	function handleKeydown(event: KeyboardEvent) {
		if (!isVisible || !hasItems) return;

		switch (event.key) {
			case 'ArrowDown': {
				event.preventDefault();
				const nextIndex = safeSelectedIndex < visibleItems.length - 1 ? safeSelectedIndex + 1 : 0;
				onNavigate?.(nextIndex);
				break;
			}

			case 'ArrowUp': {
				event.preventDefault();
				const prevIndex = safeSelectedIndex > 0 ? safeSelectedIndex - 1 : visibleItems.length - 1;
				onNavigate?.(prevIndex);
				break;
			}

			case 'Enter': {
				event.preventDefault();
				const selectedItem = visibleItems[safeSelectedIndex];
				if (selectedItem) {
					onSelect(selectedItem);
				}
				break;
			}

			case 'Escape': {
				event.preventDefault();
				onClose();
				break;
			}
		}
	}

	function selectItem(item: T, index: number) {
		onNavigate?.(index);
		onSelect(item);
	}

	function handleItemMouseEnter(index: number) {
		onNavigate?.(index);
	}

	onMount(() => {
		document.addEventListener('keydown', handleKeydown);
		return () => document.removeEventListener('keydown', handleKeydown);
	});
</script>

{#if isVisible && position}
	<div
		class="autocomplete-dropdown {className}"
		style="left: {position.x}px; top: {position.y}px;"
		role="listbox"
		data-testid="autocomplete-dropdown"
	>
		<div
			class="
				bg-popover border-border text-popover-foreground
				max-w-sm rounded-md border shadow-lg
				{variant === 'compact' ? 'py-1' : 'py-2'}
			"
		>
			{#if !hasItems}
				<div
					class="
						text-muted-foreground
						{variant === 'compact' ? 'px-2 py-1 text-sm' : 'px-3 py-2'}
					"
				>
					{emptyMessage}
				</div>
			{:else}
				{#each visibleItems as item, index (item.id)}
					{@const isSelected = index === safeSelectedIndex}
					{@const label = getItemLabel(item)}
					{@const detail = getItemDetail?.(item)}
					{@const info = getItemInfo?.(item)}

					<button
						type="button"
						class="
							block w-full cursor-pointer text-left transition-colors
							{variant === 'compact' ? 'px-2 py-1' : 'px-3 py-2'}
							{isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'}
						"
						role="option"
						aria-selected={isSelected}
						onclick={() => selectItem(item, index)}
						onmouseenter={() => handleItemMouseEnter(index)}
						data-testid="autocomplete-item"
					>
						<div class="flex items-center justify-between gap-2">
							<div class="min-w-0 flex-1">
								<div class="truncate text-sm font-medium">
									{label}
								</div>
								{#if detail}
									<div class="text-muted-foreground truncate text-xs">
										{detail}
									</div>
								{/if}
							</div>
							{#if info}
								<div class="text-muted-foreground text-xs opacity-75">
									{info}
								</div>
							{/if}
						</div>
					</button>
				{/each}
			{/if}
		</div>
	</div>
{/if}

<style>
	.autocomplete-dropdown {
		position: fixed;
		z-index: 50;
		min-width: 200px;
		max-width: 400px;
	}
</style>
