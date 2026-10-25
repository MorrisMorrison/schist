<script lang="ts">
	// Floating menu opened at a pointer or row position (folder and document rows).
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	interface Props extends HTMLAttributes<HTMLDivElement> {
		position: { x: number; y: number };
		onClose: () => void;
		children: Snippet;
	}

	let { position, onClose, class: className, children, ...restProps }: Props = $props();
</script>

<div
	class={cn('bg-primary border-primary fixed z-50 rounded-lg border py-1 shadow-lg', className)}
	style="left: {position.x}px; top: {position.y}px"
	onclick={(e) => e.stopPropagation()}
	onkeydown={(e) => {
		if (e.key === 'Escape') onClose();
	}}
	role="menu"
	tabindex="-1"
	{...restProps}
>
	{@render children()}
</div>
