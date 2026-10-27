<script lang="ts" module>
	import { type VariantProps, tv } from 'tailwind-variants';

	export const tabsListVariants = tv({
		base: 'text-muted-foreground inline-flex items-center',
		variants: {
			variant: {
				default: 'bg-muted h-9 w-fit justify-center rounded-lg p-[3px]',
				line: 'border-border w-full justify-start border-b'
			}
		},
		defaultVariants: {
			variant: 'default'
		}
	});

	export type TabsVariant = VariantProps<typeof tabsListVariants>['variant'];
</script>

<script lang="ts">
	import { Tabs as TabsPrimitive } from 'bits-ui';
	import { cn } from '#lib/utils.ts';
	import { setTabsVariant } from './context.js';

	let {
		ref = $bindable(null),
		class: className,
		variant = 'default',
		...restProps
	}: TabsPrimitive.ListProps & {
		variant?: TabsVariant;
	} = $props();

	// The triggers style themselves after the list they sit in.
	setTabsVariant(() => variant);
</script>

<TabsPrimitive.List
	bind:ref
	data-slot="tabs-list"
	data-variant={variant}
	class={cn(tabsListVariants({ variant }), className)}
	{...restProps}
/>
