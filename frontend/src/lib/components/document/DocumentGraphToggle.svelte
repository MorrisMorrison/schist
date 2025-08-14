<script lang="ts">
	import { List, Network } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';

	interface Props {
		currentView: 'list' | 'graph';
		onToggle: (view: 'list' | 'graph') => void;
		disabled?: boolean;
	}

	const { currentView, onToggle, disabled = false }: Props = $props();
</script>

<div class="flex items-center justify-end mb-4">
	<div class="flex gap-1 bg-muted p-1 rounded-lg">
		<Button
			variant={currentView === 'graph' ? 'default' : 'outline'}
			size="sm"
			onclick={() => onToggle('graph')}
			{disabled}
			class="min-w-20 h-9 rounded transition-all duration-200 hover:-translate-y-px"
		>
			<Network class="h-4 w-4" />
			<span class="ml-2">Graph</span>
		</Button>
		<Button
			variant={currentView === 'list' ? 'default' : 'outline'}
			size="sm"
			onclick={() => onToggle('list')}
			{disabled}
			class="min-w-20 h-9 rounded transition-all duration-200 hover:-translate-y-px"
		>
			<List class="h-4 w-4" />
			<span class="ml-2">List</span>
		</Button>
	</div>
</div>
