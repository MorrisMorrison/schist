<script lang="ts">
	import { themeStore, themeActions } from '$lib/stores/theme.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Moon, Sun } from '@lucide/svelte';

	function handleToggle() {
		themeActions.toggleTheme();
	}
</script>

<Button
	variant="outline"
	size="icon"
	onclick={handleToggle}
	title="Toggle theme (current: {themeStore.current})"
	aria-label="Toggle theme"
	data-testid="theme-toggle"
>
	{#if themeStore.current === 'dark'}
		<Sun class="h-4 w-4"></Sun>
	{:else}
		<Moon class="h-4 w-4"></Moon>
	{/if}
</Button>
