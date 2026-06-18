<script lang="ts">
	import { AlertCircle } from '@lucide/svelte';
	import { cn } from '$lib/utils.js';

	interface Props {
		message: string;
		class?: string;
	}

	let { message, class: className }: Props = $props();
</script>

<div
	class={cn(
		'flex items-center gap-2 rounded-md bg-red-50 p-2 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400',
		className
	)}
>
	<AlertCircle class="h-4 w-4 flex-shrink-0" />
	{message}
</div>
