<script lang="ts">
	import type { HrBlock } from '$lib/utils/markdown-blocks';

	// Props are required but not used in this component
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	let { block }: { block: HrBlock } = $props();
</script>

<hr class="my-8 border-gray-200 dark:border-gray-700" />
