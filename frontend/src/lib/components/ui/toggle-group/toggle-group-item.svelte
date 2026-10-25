<script lang="ts">
	import { ToggleGroup as ToggleGroupPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';
	import { getToggleGroupStyle } from './context.js';
	import {
		toggleGroupItemVariants,
		type ToggleGroupSize,
		type ToggleGroupVariant
	} from './toggle-group.svelte';

	let {
		ref = $bindable(null),
		value,
		class: className,
		variant,
		size,
		...restProps
	}: ToggleGroupPrimitive.ItemProps & {
		variant?: ToggleGroupVariant;
		size?: ToggleGroupSize;
	} = $props();

	const group = getToggleGroupStyle();
</script>

<ToggleGroupPrimitive.Item
	bind:ref
	{value}
	data-slot="toggle-group-item"
	class={cn(
		toggleGroupItemVariants({
			variant: variant ?? group().variant,
			size: size ?? group().size
		}),
		className
	)}
	{...restProps}
/>
