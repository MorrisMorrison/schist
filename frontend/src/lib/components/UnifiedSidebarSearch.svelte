<script lang="ts">
	import { Search, X } from '@lucide/svelte';

	interface Props {
		value?: string;
		placeholder?: string;
		onSearch?: (query: string) => void;
		className?: string;
		dataTestId?: string;
	}

	let {
		value = '',
		placeholder = 'Filter folders, pages... (try "tag:name")',
		onSearch = () => {},
		className = '',
		dataTestId = 'sidebar-search'
	}: Props = $props();

	let currentQuery = $state(value);

	function handleInput(event: Event) {
		const target = event.target as HTMLInputElement;
		currentQuery = target.value;
		onSearch(currentQuery);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			onSearch(currentQuery);
		}
	}

	function clearSearch() {
		currentQuery = '';
		onSearch('');
	}
</script>

<div class={`relative ${className}`}>
	<div class="relative">
		<Search
			class="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 transform"
		/>
		<input
			data-testid="${dataTestId}"
			bind:value={currentQuery}
			type="text"
			{placeholder}
			class="border-border bg-background focus:border-primary focus:ring-primary placeholder:text-muted-foreground w-full rounded-md border py-2 pr-10 pl-9 text-sm focus:ring-2 focus:outline-none"
			oninput={handleInput}
			onkeydown={handleKeydown}
		/>
		{#if currentQuery}
			<button
				type="button"
				onclick={clearSearch}
				class="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2"
				aria-label="Clear search"
			>
				<X class="h-4 w-4" />
			</button>
		{/if}
	</div>
</div>
