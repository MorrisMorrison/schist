<script lang="ts">
	// A labelled ui/select for the library's component tests.
	import * as Select from '$lib/components/ui/select';
	import { Label } from '$lib/components/ui/label';

	interface Props {
		items: { value: string; label: string; disabled?: boolean }[];
		value?: string;
		placeholder?: string;
		disabled?: boolean;
		size?: 'default' | 'sm';
		grouped?: boolean;
		onValueChange?: (value: string) => void;
	}

	let {
		items,
		value = $bindable(''),
		placeholder,
		disabled = false,
		size = 'default',
		grouped = false,
		onValueChange
	}: Props = $props();
</script>

<Label for="fruit">Fruit</Label>
<Select.Root type="single" bind:value {items} {disabled} {onValueChange}>
	<Select.Trigger id="fruit" {size} data-testid="fruit-trigger">
		<Select.Value {placeholder} />
	</Select.Trigger>
	<Select.Content>
		{#if grouped}
			<Select.Group>
				<Select.Label>Fruits</Select.Label>
				{#each items as item (item.value)}
					<Select.Item {...item} />
				{/each}
			</Select.Group>
			<Select.Separator />
		{:else}
			{#each items as item (item.value)}
				<Select.Item {...item} />
			{/each}
		{/if}
	</Select.Content>
</Select.Root>
<output data-testid="fruit-value">{value}</output>
