<script lang="ts">
	// Segmented Read/Edit switch used by the document and new-document pages.
	import type { Component } from 'svelte';
	import type { DocumentMode } from '$lib/types/editor';

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

<div
	class="border-border bg-muted/50 inline-flex shrink-0 rounded-md border p-0.5"
	role="group"
	aria-label="View mode"
>
	{#each options as option (option.mode)}
		{@const Icon = option.icon}
		<button
			type="button"
			class="mode-button"
			class:mode-button-active={mode === option.mode}
			aria-pressed={mode === option.mode}
			title={option.title}
			data-testid={option.testId}
			onclick={() => onSelect(option.mode)}
		>
			<Icon class="h-4 w-4" />
			{option.label}
		</button>
	{/each}
</div>

<style>
	.mode-button {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		border-radius: calc(var(--radius) - 4px);
		padding: 0.25rem 0.625rem;
		font-size: 0.875rem;
		color: var(--muted-foreground);
		transition:
			color 150ms,
			background-color 150ms;
	}

	.mode-button:hover {
		color: var(--foreground);
	}

	.mode-button-active {
		background-color: var(--background);
		color: var(--foreground);
		box-shadow: 0 1px 2px rgb(0 0 0 / 0.08);
	}
</style>
