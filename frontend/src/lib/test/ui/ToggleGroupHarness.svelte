<script lang="ts">
	// ui/toggle-group sets (single and multiple) for the library's component tests.
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.ts';
	import type {
		ToggleGroupSize,
		ToggleGroupVariant
	} from '#lib/components/ui/toggle-group/index.ts';

	interface Props {
		type?: 'single' | 'multiple';
		single?: string;
		multiple?: string[];
		variant?: ToggleGroupVariant;
		size?: ToggleGroupSize;
		onSingleChange?: (value: string) => void;
		onMultipleChange?: (value: string[]) => void;
	}

	let {
		type = 'single',
		single = $bindable('left'),
		multiple = $bindable([]),
		variant = 'default',
		size = 'default',
		onSingleChange,
		onMultipleChange
	}: Props = $props();
</script>

{#if type === 'single'}
	<ToggleGroup.Root
		type="single"
		bind:value={single}
		onValueChange={onSingleChange}
		{variant}
		{size}
		aria-label="Alignment"
	>
		<ToggleGroup.Item value="left">Left</ToggleGroup.Item>
		<ToggleGroup.Item value="center" disabled>Center</ToggleGroup.Item>
		<ToggleGroup.Item value="right" size="lg">Right</ToggleGroup.Item>
	</ToggleGroup.Root>
	<output data-testid="toggle-value">{single}</output>
{:else}
	<ToggleGroup.Root
		type="multiple"
		bind:value={multiple}
		onValueChange={onMultipleChange}
		{variant}
		{size}
		aria-label="Formatting"
	>
		<ToggleGroup.Item value="bold">Bold</ToggleGroup.Item>
		<ToggleGroup.Item value="italic">Italic</ToggleGroup.Item>
	</ToggleGroup.Root>
	<output data-testid="toggle-value">{multiple.join(',')}</output>
{/if}
