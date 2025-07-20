<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	type Props = WithElementRef<
		HTMLAttributes<HTMLDivElement> & {
			orientation?: 'horizontal' | 'vertical';
			decorative?: boolean;
		}
	>;

	let {
		ref = $bindable(null),
		class: className,
		orientation = 'horizontal',
		decorative = true,
		...restProps
	}: Props = $props();
</script>

<div
	bind:this={ref}
	class={cn(
		'bg-border shrink-0',
		orientation === 'horizontal' ? 'h-[1px] w-full' : 'h-full w-[1px]',
		className
	)}
	role={decorative ? 'none' : 'separator'}
	aria-orientation={orientation}
	{...restProps}
></div>
