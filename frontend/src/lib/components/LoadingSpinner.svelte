<script lang="ts">
  import { cn } from '$lib/utils.js';

  interface Props {
    class?: string;
    size?: 'sm' | 'md' | 'lg';
  }

  let { class: className, size = 'md' }: Props = $props();

  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6', 
    lg: 'w-8 h-8'
  };
</script>

<div class={cn('flex items-center justify-center', className)}>
  <div 
    class={cn(
      'animate-spin rounded-full border-2 border-muted border-t-foreground',
      sizeClasses[size]
    )}
  ></div>
</div>