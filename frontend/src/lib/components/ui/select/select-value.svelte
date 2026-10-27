<script lang="ts">
	// The selected item's label (or the placeholder). Needs `items` on the Root so the
	// label is known before the list has been opened.
	import { Select as SelectPrimitive } from 'bits-ui';
	import { cn } from '#lib/utils.ts';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: SelectPrimitive.ValueProps = $props();
</script>

<SelectPrimitive.Value
	bind:ref
	data-slot="select-value"
	class={cn('truncate', className)}
	{...restProps}
/>
