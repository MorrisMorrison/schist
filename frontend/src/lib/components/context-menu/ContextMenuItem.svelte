<script lang="ts">
	import type { Component } from 'svelte';
	import { cn } from '$lib/utils.js';

	interface Props {
		icon: Component<{ class?: string }>;
		label: string;
		onclick: () => void;
		destructive?: boolean;
	}

	let { icon: Icon, label, onclick, destructive = false }: Props = $props();
</script>

<button
	type="button"
	class={cn(
		'flex w-full items-center gap-2 px-3 py-2 text-left text-sm',
		destructive
			? 'text-destructive hover:bg-destructive/10 transition-colors'
			: 'hover:bg-accent hover:text-accent-foreground'
	)}
	{onclick}
>
	<Icon class="h-4 w-4" />
	{label}
</button>
