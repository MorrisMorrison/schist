<script lang="ts">
	import { List, Network } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';

	interface Props {
		currentView: 'list' | 'graph';
		onToggle: (view: 'list' | 'graph') => void;
		disabled?: boolean;
	}

	const { currentView, onToggle, disabled = false }: Props = $props();
</script>

<div class="mb-4 flex items-center justify-end">
	<div class="bg-muted flex gap-1 rounded-lg p-1">
		<Button
			variant={currentView === 'graph' ? 'default' : 'outline'}
			size="sm"
			onclick={() => onToggle('graph')}
			{disabled}
			class="h-9 min-w-20 rounded transition-all duration-200 hover:-translate-y-px"
		>
			<Network class="h-4 w-4" />
			<span class="ml-2">Graph</span>
		</Button>
		<Button
			variant={currentView === 'list' ? 'default' : 'outline'}
			size="sm"
			onclick={() => onToggle('list')}
			{disabled}
			class="h-9 min-w-20 rounded transition-all duration-200 hover:-translate-y-px"
		>
			<List class="h-4 w-4" />
			<span class="ml-2">List</span>
		</Button>
	</div>
</div>
