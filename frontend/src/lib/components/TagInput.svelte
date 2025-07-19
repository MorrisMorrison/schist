<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { X, Plus } from 'lucide-svelte';

	interface Props {
		tags: string[];
		onTagsChange: (tags: string[]) => void;
		placeholder?: string;
		maxTags?: number;
		allowDuplicates?: boolean;
	}

	let {
		tags = [],
		onTagsChange,
		placeholder = 'Add tags...',
		maxTags = 10,
		allowDuplicates = false
	}: Props = $props();

	let inputValue = $state('');
	let inputElement: HTMLInputElement | undefined = $state();

	// Handle adding a new tag
	function addTag(tagText: string) {
		const trimmedTag = tagText.trim();
		if (!trimmedTag) return;

		// Check for duplicates if not allowed
		if (!allowDuplicates && tags.includes(trimmedTag)) return;

		// Check max tags limit
		if (tags.length >= maxTags) return;

		// Add the tag
		const newTags = [...tags, trimmedTag];
		onTagsChange(newTags);
		inputValue = '';
	}

	// Handle removing a tag
	function removeTag(index: number) {
		const newTags = tags.filter((_, i) => i !== index);
		onTagsChange(newTags);
	}

	// Handle input key events
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ',') {
			event.preventDefault();
			addTag(inputValue);
		} else if (event.key === 'Backspace' && !inputValue && tags.length > 0) {
			// Remove last tag if input is empty and backspace is pressed
			removeTag(tags.length - 1);
		}
	}

	// Handle add button click
	function handleAddClick() {
		addTag(inputValue);
		inputElement?.focus();
	}

	// Handle input blur (add tag on blur if there's content)
	function handleBlur() {
		if (inputValue.trim()) {
			addTag(inputValue);
		}
	}
</script>

<div class="space-y-2">
	<!-- Tags Display -->
	{#if tags.length > 0}
		<div class="flex flex-wrap gap-2">
			{#each tags as tag, index (tag)}
				<Badge variant="secondary" class="flex items-center gap-1 pr-1">
					<span>{tag}</span>
					<button
						type="button"
						onclick={() => removeTag(index)}
						class="hover:bg-secondary-foreground/20 rounded-full p-0.5 transition-colors"
						aria-label="Remove tag {tag}"
					>
						<X class="h-3 w-3" />
					</button>
				</Badge>
			{/each}
		</div>
	{/if}

	<!-- Tag Input -->
	<div class="flex items-center gap-2">
		<div class="w-48">
			<Input
				bind:this={inputElement}
				bind:value={inputValue}
				onkeydown={handleKeydown}
				onblur={handleBlur}
				{placeholder}
				disabled={tags.length >= maxTags}
				class="w-full"
				size="sm"
			/>
		</div>
		<Button
			type="button"
			variant="outline"
			size="sm"
			onclick={handleAddClick}
			disabled={!inputValue.trim() || tags.length >= maxTags}
			class="shrink-0"
		>
			<Plus class="h-3 w-3" />
		</Button>
		<span class="text-xs text-muted-foreground">({tags.length}/{maxTags})</span>
	</div>
</div>