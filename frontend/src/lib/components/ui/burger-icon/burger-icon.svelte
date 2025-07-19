<script lang="ts">
	import { cn } from '$lib/utils';

	interface Props {
		isOpen?: boolean;
		onClick?: () => void;
		class?: string;
		size?: 'sm' | 'md' | 'lg';
	}

	let { isOpen = false, onClick, class: className, size = 'md' }: Props = $props();

	const sizeClasses = {
		sm: 'w-5 h-5',
		md: 'w-6 h-6',
		lg: 'w-8 h-8'
	};

	const lineHeight = {
		sm: 'h-0.5',
		md: 'h-0.5',
		lg: 'h-0.5'
	};
</script>

<button
	type="button"
	class={cn(
		'flex flex-col items-center justify-center',
		'transition-all duration-200 ease-in-out',
		'rounded-md p-2 hover:bg-gray-100 dark:hover:bg-gray-800',
		'focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:outline-none',
		sizeClasses[size],
		className
	)}
	onclick={onClick}
	aria-label={isOpen ? 'Close sidebar' : 'Open sidebar'}
	aria-expanded={isOpen}
>
	<!-- Top line -->
	<div
		class={cn(
			'bg-gray-600 transition-all duration-300 ease-in-out dark:bg-gray-400',
			'w-full rounded-sm',
			lineHeight[size],
			isOpen ? 'translate-y-1 rotate-45' : 'translate-y-0 rotate-0'
		)}
	></div>

	<!-- Middle line -->
	<div
		class={cn(
			'bg-gray-600 transition-all duration-300 ease-in-out dark:bg-gray-400',
			'my-0.5 w-full rounded-sm',
			lineHeight[size],
			isOpen ? 'scale-0 opacity-0' : 'scale-100 opacity-100'
		)}
	></div>

	<!-- Bottom line -->
	<div
		class={cn(
			'bg-gray-600 transition-all duration-300 ease-in-out dark:bg-gray-400',
			'w-full rounded-sm',
			lineHeight[size],
			isOpen ? '-translate-y-1 -rotate-45' : 'translate-y-0 rotate-0'
		)}
	></div>
</button>
