<script lang="ts">
	import { cn } from '$lib/utils.js';

	interface Props {
		checked?: boolean;
		disabled?: boolean;
		onCheckedChange?: (checked: boolean) => void;
		class?: string;
		size?: 'sm' | 'md' | 'lg';
	}

	let {
		checked = false,
		disabled = false,
		onCheckedChange,
		class: className = '',
		size = 'sm'
	}: Props = $props();

	function handleToggle() {
		if (disabled) return;
		const newChecked = !checked;
		onCheckedChange?.(newChecked);
	}

	const sizeClasses = {
		sm: 'h-5 w-9',
		md: 'h-6 w-11',
		lg: 'h-7 w-14'
	};

	const thumbSizeClasses = {
		sm: 'h-4 w-4',
		md: 'h-5 w-5',
		lg: 'h-6 w-6'
	};

	const translateClasses = $derived({
		sm: checked ? 'translate-x-4' : 'translate-x-0',
		md: checked ? 'translate-x-5' : 'translate-x-0',
		lg: checked ? 'translate-x-7' : 'translate-x-0'
	});
</script>

<button
	type="button"
	role="switch"
	aria-checked={checked}
	aria-disabled={disabled}
	aria-label="Toggle switch"
	{disabled}
	class={cn(
		'focus-visible:ring-ring focus-visible:ring-offset-background inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
		sizeClasses[size],
		checked ? 'bg-blue' : 'bg-input',
		className
	)}
	onclick={handleToggle}
>
	<span
		class={cn(
			'bg-background pointer-events-none block rounded-full shadow-lg ring-0 transition-transform',
			thumbSizeClasses[size],
			translateClasses[size]
		)}
	></span>
</button>
