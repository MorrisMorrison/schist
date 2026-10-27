<script lang="ts" module>
	import { tv } from 'tailwind-variants';

	export const tabsTriggerVariants = tv({
		base: "focus-visible:border-ring focus-visible:ring-ring/50 inline-flex cursor-pointer items-center justify-center gap-1.5 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
		variants: {
			variant: {
				default:
					'text-foreground dark:text-muted-foreground data-[state=active]:bg-background dark:data-[state=active]:text-foreground dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 h-[calc(100%-1px)] flex-1 rounded-md border border-transparent px-2 py-1 data-[state=active]:shadow-sm',
				line: 'text-muted-foreground hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-primary -mb-px border-b-2 border-transparent px-4 py-2'
			}
		},
		defaultVariants: {
			variant: 'default'
		}
	});
</script>

<script lang="ts">
	import { Tabs as TabsPrimitive } from 'bits-ui';
	import { cn } from '#lib/utils.ts';
	import { getTabsVariant } from './context.js';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: TabsPrimitive.TriggerProps = $props();

	const variant = getTabsVariant();
</script>

<TabsPrimitive.Trigger
	bind:ref
	data-slot="tabs-trigger"
	class={cn(tabsTriggerVariants({ variant: variant() }), className)}
	{...restProps}
/>
