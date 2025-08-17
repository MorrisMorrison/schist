<script lang="ts">
	import UnifiedSidebarSearch from '../UnifiedSidebarSearch.svelte';

	interface Props {
		value?: string;
		placeholder?: string;
		dataTestId?: string;
		onSearch?: (query: string) => void;
	}

	let {
		value = '',
		placeholder = "Filter folders, pages... (try 'tag:name')",
		dataTestId = 'sidebar-search',
		onSearch
	}: Props = $props();

	function handleSearch(query: string) {
		onSearch?.(query);
	}
</script>

<div class="border-border border-b p-3">
	<UnifiedSidebarSearch {dataTestId} {value} {placeholder} onSearch={handleSearch} />
</div>
