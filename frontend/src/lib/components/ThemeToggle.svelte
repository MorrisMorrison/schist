<script lang="ts">
  import { theme, resolvedTheme, themeActions } from '$lib/stores/theme.js';
  
  let { size = 'sm' }: { size?: 'sm' | 'md' | 'lg' } = $props();
  
  const sizeClasses = {
    sm: 'p-2 text-sm',
    md: 'p-2.5 text-base',  
    lg: 'p-3 text-lg'
  };
  
  function handleToggle() {
    if ($theme === 'light') {
      themeActions.setTheme('dark');
    } else if ($theme === 'dark') {
      themeActions.setSystemTheme();
    } else {
      themeActions.setTheme('light');
    }
  }
</script>

<button
  onclick={handleToggle}
  class="rounded-md border border-secondary bg-primary text-primary hover:bg-gray-hover focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors {sizeClasses[size]}"
  title="Toggle theme ({$theme === 'system' ? 'system' : $resolvedTheme})"
  aria-label="Toggle theme"
>
  {#if $theme === 'system'}
    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  {:else if $resolvedTheme === 'dark'}
    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  {:else}
    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  {/if}
</button>