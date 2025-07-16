<script lang="ts">
  import { Alert, AlertDescription } from '$lib/components/ui/alert/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { X, AlertCircle } from 'lucide-svelte';

  interface Props {
    error: string;
    onDismiss?: () => void;
    class?: string;
  }

  let { error, onDismiss, class: className }: Props = $props();
</script>

<Alert class={className} variant="destructive">
  <AlertCircle class="h-4 w-4" />
  <AlertDescription class="flex items-center justify-between">
    <span>{error}</span>
    {#if onDismiss}
      <Button
        variant="ghost"
        size="sm"
        onclick={onDismiss}
        class="h-auto p-0 hover:bg-transparent"
      >
        <X class="h-4 w-4" />
      </Button>
    {/if}
  </AlertDescription>
</Alert>