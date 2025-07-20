<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLLabelAttributes } from 'svelte/elements';

	type Props = WithElementRef<HTMLLabelAttributes>;

	let { ref = $bindable(null), class: className, children, ...restProps }: Props = $props();
</script>

<label
	bind:this={ref}
	class={cn(
		'text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</label>
