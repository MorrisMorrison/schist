<script lang="ts">
	// The "⋮" on a tree row: shown on hover, opens the row's context menu.
	import { MoreVertical } from '@lucide/svelte';

	interface Props {
		label: string;
		onOpen: (event: MouseEvent | KeyboardEvent) => void;
		testId?: string;
	}

	let { label, onOpen, testId }: Props = $props();
</script>

<span
	class="hover:bg-accent absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer rounded p-1 opacity-0 group-hover:opacity-100"
	onclick={(e) => {
		e.stopPropagation();
		onOpen(e);
	}}
	onkeydown={(e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			e.stopPropagation();
			onOpen(e);
		}
	}}
	role="button"
	tabindex="0"
	aria-label={label}
	data-testid={testId}
>
	<MoreVertical class="h-3 w-3" />
</span>
