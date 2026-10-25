<script lang="ts" module>
	import { type VariantProps, tv } from 'tailwind-variants';

	/**
	 * The content column every page sits in. Two widths only:
	 * - `reading`: documents, the editor, new pages, shares and settings. 47rem
	 *   including padding leaves a 44rem column, about 70 characters of body text.
	 * - `wide`: browse pages with card grids (home, folders, recent).
	 */
	export const pageContainerVariants = tv({
		base: 'mx-auto w-full space-y-8 p-6',
		variants: {
			width: {
				reading: 'max-w-[47rem]',
				wide: 'max-w-6xl'
			}
		},
		defaultVariants: {
			width: 'reading'
		}
	});

	export type PageContainerWidth = VariantProps<typeof pageContainerVariants>['width'];
</script>

<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		width = 'reading',
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		width?: PageContainerWidth;
	} = $props();
</script>

<div
	bind:this={ref}
	data-slot="page-container"
	data-width={width}
	class={cn(pageContainerVariants({ width }), className)}
	{...restProps}
>
	{@render children?.()}
</div>
