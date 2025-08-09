<script lang="ts">
	import { Info } from 'lucide-svelte';

	interface Props {
		title: string;
		description: string;
	}

	let { title, description }: Props = $props();
</script>

<div
	class="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950/50"
>
	<div class="flex">
		<Info class="mt-0.5 mr-2 h-4 w-4 flex-shrink-0 text-blue-600 dark:text-blue-400" />
		<div>
			<p class="text-sm font-medium text-blue-900 dark:text-blue-200">{title}</p>
			<p class="mt-1 text-xs text-blue-700 dark:text-blue-300">
				{description}
			</p>
		</div>
	</div>
</div>