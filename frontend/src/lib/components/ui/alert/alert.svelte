<script lang="ts" module>
	import { type VariantProps, tv } from 'tailwind-variants';

	export const alertVariants = tv({
		base: 'relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border px-4 py-3 text-sm has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current',
		variants: {
			variant: {
				default: 'bg-card text-card-foreground',
				destructive:
					'text-destructive bg-card *:data-[slot=alert-description]:text-destructive/90 [&>svg]:text-current',
				success:
					'border-green-200 bg-green-50 text-green-800 *:data-[slot=alert-description]:text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-300 dark:*:data-[slot=alert-description]:text-green-400 [&>svg]:text-green-600 dark:[&>svg]:text-green-400',
				warning:
					'border-amber-200 bg-amber-50 text-amber-800 *:data-[slot=alert-description]:text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200 dark:*:data-[slot=alert-description]:text-amber-200 [&>svg]:text-amber-600 dark:[&>svg]:text-amber-400',
				info: 'border-blue-200 bg-blue-50 text-blue-800 *:data-[slot=alert-description]:text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-200 dark:*:data-[slot=alert-description]:text-blue-300 [&>svg]:text-blue-600 dark:[&>svg]:text-blue-400',
				muted:
					'bg-muted text-foreground *:data-[slot=alert-description]:text-muted-foreground [&>svg]:text-muted-foreground'
			}
		},
		defaultVariants: {
			variant: 'default'
		}
	});

	export type AlertVariant = VariantProps<typeof alertVariants>['variant'];
</script>

<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '#lib/utils.ts';

	let {
		ref = $bindable(null),
		class: className,
		variant = 'default',
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		variant?: AlertVariant;
	} = $props();
</script>

<div
	bind:this={ref}
	data-slot="alert"
	data-variant={variant}
	role="alert"
	class={cn(alertVariants({ variant }), className)}
	{...restProps}
>
	{@render children?.()}
</div>
