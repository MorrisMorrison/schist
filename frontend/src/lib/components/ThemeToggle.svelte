<script lang="ts">
	import { theme, themeActions } from '$lib/stores/theme.js';
	import { Moon, Sun } from 'lucide-svelte';

	let { size = 'sm' }: { size?: 'sm' | 'md' | 'lg' } = $props();

	const sizeClasses = {
		sm: 'p-2 text-sm',
		md: 'p-2.5 text-base',
		lg: 'p-3 text-lg'
	};

	function handleToggle() {
		themeActions.toggleTheme();
	}
</script>

<button
	onclick={handleToggle}
	class="border-secondary bg-primary text-primary hover:bg-gray-hover cursor-pointer rounded-md border transition-colors focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none {sizeClasses[
		size
	]}"
	title="Toggle theme (current: {$theme})"
	aria-label="Toggle theme"
>
	{#if $theme === 'dark'}
		<Sun class="h-4 w-4"></Sun>
	{:else}
		<Moon class="h-4 w-4"></Moon>
	{/if}
</button>
