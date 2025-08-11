<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { tagActions, tagsStore } from '$lib/stores/tags';
	import { Hash, X } from 'lucide-svelte';

	interface Props {
		tag: string;
		variant?: 'default' | 'secondary' | 'outline';
		showIcon?: boolean;
		clickable?: boolean;
		removable?: boolean;
		onRemove?: (tag: string) => void;
		onclick?: (tag: string) => void;
	}

	let {
		tag,
		variant = 'default',
		showIcon = true,
		clickable = true,
		removable = false,
		onRemove,
		onclick
	}: Props = $props();

	const isActiveFilter = $derived($tagsStore.activeFilters.includes(tag));

	function handleClick() {
		if (!clickable) return;
		if (onclick) {
			onclick(tag);
		} else {
			tagActions.toggleTagFilter(tag);
		}
	}

	function handleRemove(event: MouseEvent) {
		event.stopPropagation();
		if (onRemove) {
			onRemove(tag);
		}
	}
</script>

<Badge
	{variant}
	class={`
		${clickable ? 'cursor-pointer transition-opacity hover:opacity-80' : ''}
		${isActiveFilter ? 'bg-blue-100 text-blue-900 ring-2 ring-blue-500' : ''}
		${removable ? 'pr-1' : ''}
		flex items-center gap-1.5
	`}
	onclick={handleClick}
	role={clickable ? 'button' : undefined}
	tabindex={clickable ? 0 : undefined}
	aria-pressed={clickable ? isActiveFilter : undefined}
>
	{#if showIcon}
		<Hash class="h-3 w-3" />
	{/if}
	<span class="text-sm">{tag}</span>
	{#if removable && onRemove}
		<button
			type="button"
			onclick={handleRemove}
			class="hover:bg-secondary-foreground/20 ml-1 rounded-full p-0.5 transition-colors"
			aria-label="Remove tag {tag}"
		>
			<X class="h-3 w-3" />
		</button>
	{/if}
</Badge>
