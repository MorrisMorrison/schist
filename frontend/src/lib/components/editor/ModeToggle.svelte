<script lang="ts">
	// Segmented Read/Edit switch used by the document and new-document pages.
	import type { Component } from 'svelte';
	import type { DocumentMode } from '$lib/types/editor';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';

	interface ModeOption {
		mode: DocumentMode;
		label: string;
		title: string;
		icon: Component<{ class?: string }>;
		testId: string;
	}

	interface Props {
		mode: DocumentMode;
		options: ModeOption[];
		onSelect: (mode: DocumentMode) => void;
	}

	let { mode, options, onSelect }: Props = $props();
</script>

<!-- Always one mode: clicking the current one (which would clear a single toggle group) is ignored. -->
<ToggleGroup.Root
	type="single"
	variant="segmented"
	size="sm"
	aria-label="View mode"
	bind:value={
		() => mode,
		(value: string) => {
			if (value && value !== mode) onSelect(value as DocumentMode);
		}
	}
>
	{#each options as option (option.mode)}
		{@const Icon = option.icon}
		<ToggleGroup.Item value={option.mode} title={option.title} data-testid={option.testId}>
			<Icon class="size-4" />
			{option.label}
		</ToggleGroup.Item>
	{/each}
</ToggleGroup.Root>
