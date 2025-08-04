<script lang="ts">
	import { cn } from '$lib/utils.js';

	interface Props {
		checked?: boolean;
		disabled?: boolean;
		required?: boolean;
		name?: string;
		value?: string;
		class?: string;
		onCheckedChange?: (checked: boolean) => void;
		onclick?: (event: Event) => void;
	}

	let {
		checked = false,
		disabled = false,
		required = false,
		name,
		value,
		class: className = '',
		onCheckedChange,
		onclick
	}: Props = $props();

	function handleChange() {
		if (disabled) return;
		const newChecked = !checked;
		onCheckedChange?.(newChecked);
	}
</script>

<button
	type="button"
	role="checkbox"
	aria-checked={checked}
	aria-disabled={disabled}
	{disabled}
	class={cn(
		'peer border-primary ring-offset-background focus-visible:ring-ring data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground h-5 w-5 shrink-0 rounded-sm border-2 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
		checked && 'bg-primary text-primary-foreground border-primary',
		className
	)}
	data-state={checked ? 'checked' : 'unchecked'}
	onclick={(e) => {
		onclick?.(e);
		handleChange();
	}}
>
	{#if checked}
		<svg
			class="h-3 w-3"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="3"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<polyline points="20,6 9,17 4,12" />
		</svg>
	{/if}
</button>

<!-- Hidden input for form submission -->
{#if name}
	<input type="checkbox" {name} {value} {checked} {required} {disabled} class="sr-only" />
{/if}
