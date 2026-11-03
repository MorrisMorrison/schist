<script lang="ts">
	import { cn } from '#lib/utils.ts';

	/**
	 * A drag handle that resizes the panel to its left: a focusable vertical
	 * separator. Drag it, use the arrow keys (Shift for bigger steps),
	 * Home/End for the limits, or double-click / Enter for the default size.
	 * The owner keeps the size and gets every change through onResize.
	 */
	interface Props {
		value: number;
		min: number;
		max: number;
		defaultValue: number;
		label: string;
		/** Arrow-key step in pixels; Shift uses four times this. */
		step?: number;
		onResize: (value: number) => void;
		onResizeStart?: () => void;
		onResizeEnd?: () => void;
		class?: string;
		'data-testid'?: string;
	}

	let {
		value,
		min,
		max,
		defaultValue,
		label,
		step = 16,
		onResize,
		onResizeStart,
		onResizeEnd,
		class: className,
		'data-testid': testId
	}: Props = $props();

	let drag = $state<{ pointerId: number; startX: number; startValue: number } | null>(null);

	const clamp = (next: number) => Math.round(Math.min(max, Math.max(min, next)));

	function handlePointerDown(event: PointerEvent) {
		if (event.button !== 0) return;
		event.preventDefault();
		drag = { pointerId: event.pointerId, startX: event.clientX, startValue: value };
		(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
		onResizeStart?.();
	}

	function handlePointerMove(event: PointerEvent) {
		if (!drag || event.pointerId !== drag.pointerId) return;
		onResize(clamp(drag.startValue + event.clientX - drag.startX));
	}

	function handlePointerEnd(event: PointerEvent) {
		if (!drag || event.pointerId !== drag.pointerId) return;
		(event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
		drag = null;
		onResizeEnd?.();
	}

	function handleKeydown(event: KeyboardEvent) {
		const amount = event.shiftKey ? step * 4 : step;
		let next: number | null = null;
		if (event.key === 'ArrowLeft') next = value - amount;
		else if (event.key === 'ArrowRight') next = value + amount;
		else if (event.key === 'Home') next = min;
		else if (event.key === 'End') next = max;
		else if (event.key === 'Enter') next = defaultValue;
		if (next === null) return;
		event.preventDefault();
		onResize(clamp(next));
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
	role="separator"
	aria-orientation="vertical"
	aria-label={label}
	aria-valuenow={value}
	aria-valuemin={min}
	aria-valuemax={max}
	tabindex="0"
	title="Drag to resize, double-click to reset"
	data-slot="resize-handle"
	data-dragging={drag ? '' : undefined}
	data-testid={testId}
	class={cn(
		'group/resize relative w-2 shrink-0 cursor-col-resize touch-none select-none focus-visible:outline-none',
		"after:bg-border after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:transition-colors after:content-['']",
		'hover:after:bg-primary/60 focus-visible:after:bg-ring data-[dragging]:after:bg-primary after:hover:w-0.5 focus-visible:after:w-0.5 data-[dragging]:after:w-0.5',
		className
	)}
	onpointerdown={handlePointerDown}
	onpointermove={handlePointerMove}
	onpointerup={handlePointerEnd}
	onpointercancel={handlePointerEnd}
	ondblclick={() => onResize(clamp(defaultValue))}
	onkeydown={handleKeydown}
></div>
