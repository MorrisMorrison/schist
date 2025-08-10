<script lang="ts">
	import type { ListItemBlock } from '$lib/utils/markdown-blocks';

	let { block }: { block: ListItemBlock } = $props();
</script>

<li class="mb-2">{@html block.text}</li>
