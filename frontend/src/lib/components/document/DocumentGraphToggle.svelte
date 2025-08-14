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

<div class="view-toggle">
	<div class="toggle-buttons">
		<Button
			variant={currentView === 'graph' ? 'default' : 'outline'}
			size="sm"
			onclick={() => onToggle('graph')}
			{disabled}
			class="toggle-button"
		>
			<Network class="h-4 w-4" />
			<span class="ml-2">Graph</span>
		</Button>
		<Button
			variant={currentView === 'list' ? 'default' : 'outline'}
			size="sm"
			onclick={() => onToggle('list')}
			{disabled}
			class="toggle-button"
		>
			<List class="h-4 w-4" />
			<span class="ml-2">List</span>
		</Button>
	</div>
</div>

<style>
	.view-toggle {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		margin-bottom: 16px;
	}

	.toggle-buttons {
		display: flex;
		gap: 4px;
		background: var(--muted);
		padding: 4px;
		border-radius: 8px;
	}

	:global(.toggle-button) {
		min-width: 80px;
		height: 36px;
		border-radius: 4px !important;
		transition: all 0.2s ease;
	}

	:global(.toggle-button:hover) {
		transform: translateY(-1px);
	}
</style>
