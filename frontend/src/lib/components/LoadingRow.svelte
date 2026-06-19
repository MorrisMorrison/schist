<script lang="ts">
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';

	interface Props {
		text: string;
	}

	let { text }: Props = $props();
</script>

<div class="flex items-center justify-center py-6">
	<LoadingSpinner size="md" />
	<span class="text-muted-foreground ml-2 text-sm">{text}</span>
</div>
