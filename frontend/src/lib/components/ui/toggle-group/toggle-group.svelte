<script lang="ts" module>
	import { type VariantProps, tv } from 'tailwind-variants';

	export const toggleGroupVariants = tv({
		base: 'inline-flex w-fit items-center',
		variants: {
			variant: {
				default: 'gap-1',
				outline: 'rounded-md shadow-xs',
				segmented: 'border-border bg-muted/50 shrink-0 gap-0.5 rounded-md border p-0.5'
			}
		},
		defaultVariants: {
			variant: 'default'
		}
	});

	export const toggleGroupItemVariants = tv({
		base: "focus-visible:border-ring focus-visible:ring-ring/50 inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-[color,box-shadow,background-color] outline-none focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
		variants: {
			variant: {
				default:
					'hover:bg-muted hover:text-muted-foreground data-[state=on]:bg-accent data-[state=on]:text-accent-foreground bg-transparent',
				outline:
					'border-input hover:bg-accent hover:text-accent-foreground data-[state=on]:bg-accent data-[state=on]:text-accent-foreground rounded-none border border-l-0 bg-transparent first:rounded-l-md first:border-l last:rounded-r-md',
				segmented:
					'text-muted-foreground hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground rounded-[calc(var(--radius)-4px)] data-[state=on]:shadow-sm'
			},
			size: {
				default: 'h-9 min-w-9 px-3',
				sm: 'h-7 min-w-7 px-2.5',
				lg: 'h-10 min-w-10 px-4'
			}
		},
		defaultVariants: {
			variant: 'default',
			size: 'default'
		}
	});

	export type ToggleGroupVariant = VariantProps<typeof toggleGroupItemVariants>['variant'];
	export type ToggleGroupSize = VariantProps<typeof toggleGroupItemVariants>['size'];
</script>

<script lang="ts">
	import { ToggleGroup as ToggleGroupPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';
	import { setToggleGroupStyle } from './context.js';

	let {
		ref = $bindable(null),
		value = $bindable(),
		class: className,
		variant = 'default',
		size = 'default',
		...restProps
	}: ToggleGroupPrimitive.RootProps & {
		variant?: ToggleGroupVariant;
		size?: ToggleGroupSize;
	} = $props();

	// The items style themselves after the group they sit in.
	setToggleGroupStyle(() => ({ variant, size }));
</script>

<!-- `value` is a string for type="single" and a string[] for type="multiple". -->
<ToggleGroupPrimitive.Root
	bind:value={value as never}
	bind:ref
	data-slot="toggle-group"
	data-variant={variant}
	data-size={size}
	class={cn(toggleGroupVariants({ variant }), className)}
	{...restProps}
/>
