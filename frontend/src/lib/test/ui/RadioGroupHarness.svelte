<script lang="ts">
	// A labelled ui/radio-group for the library's component tests.
	import * as RadioGroup from '#lib/components/ui/radio-group/index.ts';
	import { Label } from '#lib/components/ui/label/index.ts';

	interface Props {
		value?: string;
		disabled?: boolean;
		name?: string;
		onValueChange?: (value: string) => void;
	}

	let { value = $bindable(''), disabled = false, name, onValueChange }: Props = $props();

	const options = [
		{ value: 'small', label: 'Small' },
		{ value: 'medium', label: 'Medium', disabled: true },
		{ value: 'large', label: 'Large' }
	];
</script>

<RadioGroup.Root bind:value {disabled} {name} {onValueChange} aria-label="Size">
	{#each options as option (option.value)}
		<div class="flex items-center gap-2">
			<RadioGroup.Item id="size-{option.value}" value={option.value} disabled={option.disabled} />
			<Label for="size-{option.value}">{option.label}</Label>
		</div>
	{/each}
</RadioGroup.Root>
<output data-testid="size-value">{value}</output>
