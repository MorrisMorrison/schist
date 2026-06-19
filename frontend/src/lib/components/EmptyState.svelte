<script lang="ts">
	import type { Component, Snippet } from 'svelte';

	interface Props {
		/** Icon rendered inside the muted circle (a Lucide / Svelte component). */
		icon: Component<{ class?: string }>;
		title: string;
		description: string;
		/** Optional action area (e.g. a button plus caption). Rendered below the description. */
		action?: Snippet;
		/** Vertical padding for the hero. Defaults to py-8. */
		padding?: string;
	}

	let { icon: Icon, title, description, action, padding = 'py-8' }: Props = $props();
</script>

<div class="space-y-4 {padding} text-center">
	<div class="bg-muted mx-auto flex h-16 w-16 items-center justify-center rounded-full">
		<Icon class="text-muted-foreground h-8 w-8" />
	</div>
	<div>
		<h3 class="text-lg font-medium">{title}</h3>
		<p class="text-muted-foreground mt-1 text-sm">{description}</p>
	</div>
	{#if action}
		{@render action()}
	{/if}
</div>
