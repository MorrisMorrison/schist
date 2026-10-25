<script lang="ts" module>
	import { type VariantProps, tv } from 'tailwind-variants';

	/**
	 * The content column every page sits in. Two widths only:
	 * - `reading`: documents, the editor, new pages, shares and settings. 59rem
	 *   including padding leaves a 56rem column: docs-site width, so tables and
	 *   code blocks have room while prose stays readable.
	 * - `wide`: browse pages with card grids (home, folders, recent).
	 * - `full`: no cap; documents use it when "Full-width documents" is on.
	 */
	export const pageContainerVariants = tv({
		base: 'mx-auto w-full space-y-8 p-6',
		variants: {
			width: {
				reading: 'max-w-[59rem]',
				wide: 'max-w-6xl',
				full: 'max-w-none'
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
