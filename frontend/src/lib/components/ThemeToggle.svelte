<script lang="ts">
	import { theme, themeActions } from '$lib/stores/theme.js';

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
	class="border-secondary bg-primary text-primary hover:bg-gray-hover rounded-md border transition-colors focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none {sizeClasses[
		size
	]}"
	title="Toggle theme (current: {$theme})"
	aria-label="Toggle theme"
>
	{#if $theme === 'dark'}
		<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
			/>
		</svg>
	{:else}
		<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
			/>
		</svg>
	{/if}
</button>
