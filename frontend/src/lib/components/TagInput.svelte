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
		suggestions?: string[];
		disabled?: boolean;
	}

	let {
		tags = [],
		onTagsChange,
		placeholder = 'Add tags...',
		maxTags = 10,
		allowDuplicates = false,
		suggestions = [],
		disabled = false
	}: Props = $props();

	let inputValue = $state('');
	let inputElement: HTMLInputElement | null = $state(null);
	let showSuggestions = $state(false);
	let selectedSuggestionIndex = $state(-1);

	// Filter suggestions based on input
	const filteredSuggestions = $derived(() => {
		if (!inputValue.trim() || !suggestions.length) return [];

		const lowerInput = inputValue.toLowerCase();
		return suggestions
			.filter(
				(suggestion) =>
					suggestion.toLowerCase().includes(lowerInput) &&
					(!allowDuplicates ? !tags.includes(suggestion) : true)
			)
			.slice(0, 5); // Limit to 5 suggestions
	});

	// Validation for tag
	const canAddTag = $derived((tagText: string) => {
		const trimmed = tagText.trim();
		if (!trimmed) return false;
		if (!allowDuplicates && tags.includes(trimmed)) return false;
		if (tags.length >= maxTags) return false;
		return true;
	});

	// Handle adding a new tag
	function addTag(tagText: string) {
		if (!canAddTag(tagText)) return;

		// Add the tag
		const newTags = [...tags, tagText.trim()];
		onTagsChange(newTags);
		inputValue = '';
		showSuggestions = false;
		selectedSuggestionIndex = -1;
	}

	// Handle removing a tag
	function removeTag(index: number) {
		const newTags = tags.filter((_, i) => i !== index);
		onTagsChange(newTags);
	}

	// Handle input key events
	function handleKeydown(event: KeyboardEvent) {
		// Handle autocomplete navigation
		if (showSuggestions && filteredSuggestions.length > 0) {
			if (event.key === 'ArrowDown') {
				event.preventDefault();
				selectedSuggestionIndex = Math.min(
					selectedSuggestionIndex + 1,
					filteredSuggestions.length - 1
				);
				return;
			} else if (event.key === 'ArrowUp') {
				event.preventDefault();
				selectedSuggestionIndex = Math.max(selectedSuggestionIndex - 1, -1);
				return;
			} else if (event.key === 'Tab' && selectedSuggestionIndex >= 0) {
				event.preventDefault();
				addTag(filteredSuggestions()[selectedSuggestionIndex]);
				return;
			} else if (event.key === 'Escape') {
				showSuggestions = false;
				selectedSuggestionIndex = -1;
				return;
			}
		}

		// Standard tag input handling
		if (event.key === 'Enter' || event.key === ',') {
			event.preventDefault();
			if (selectedSuggestionIndex >= 0 && filteredSuggestions().length > 0) {
				addTag(filteredSuggestions()[selectedSuggestionIndex]);
			} else {
				addTag(inputValue);
			}
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

	// Handle input focus
	function handleFocus() {
		if (filteredSuggestions().length > 0) {
			showSuggestions = true;
		}
	}

	// Handle input change
	function handleInput() {
		selectedSuggestionIndex = -1;
		showSuggestions = filteredSuggestions().length > 0 && inputValue.trim().length > 0;
	}

	// Handle input blur (add tag on blur if there's content)
	function handleBlur() {
		// Delay hiding suggestions to allow for clicks
		setTimeout(() => {
			if (inputValue.trim() && canAddTag(inputValue)) {
				addTag(inputValue);
			}
			showSuggestions = false;
			selectedSuggestionIndex = -1;
		}, 150);
	}

	// Handle suggestion click
	function handleSuggestionClick(suggestion: string) {
		addTag(suggestion);
		inputElement?.focus();
	}
</script>

<div class="space-y-3">
	<!-- Tags Display -->
	{#if tags.length > 0}
		<div class="flex flex-wrap gap-2">
			{#each tags as tag, index (tag)}
				<Badge
					variant="secondary"
					class="group hover:bg-secondary/80 flex items-center gap-1.5 pr-1.5 transition-all"
				>
					<span class="text-sm">{tag}</span>
					<button
						type="button"
						onclick={() => removeTag(index)}
						class="hover:bg-secondary-foreground/20 rounded-full p-0.5 opacity-0 transition-colors group-hover:opacity-100"
						aria-label="Remove tag {tag}"
						{disabled}
					>
						<X class="h-3 w-3" />
					</button>
				</Badge>
			{/each}
		</div>
	{/if}

	<!-- Tag Input Container -->
	<div class="relative">
		<div class="flex items-center gap-2">
			<div class="relative min-w-0 flex-1">
				<Input
					bind:ref={inputElement}
					bind:value={inputValue}
					onkeydown={handleKeydown}
					onblur={handleBlur}
					onfocus={handleFocus}
					oninput={handleInput}
					{placeholder}
					disabled={disabled || tags.length >= maxTags}
					class="w-full pr-16"
					data-testid="tags-input"
					autocomplete="off"
				/>

				<!-- Input hint -->
				<div
					class="text-muted-foreground pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs"
				>
					{tags.length}/{maxTags}
				</div>
			</div>

			<Button
				type="button"
				variant="outline"
				size="sm"
				onclick={handleAddClick}
				disabled={disabled || !canAddTag(inputValue) || tags.length >= maxTags}
				class="shrink-0"
			>
				<Plus class="h-3 w-3" />
			</Button>
		</div>

		<!-- Autocomplete Suggestions -->
		{#if showSuggestions && filteredSuggestions().length > 0}
			<div
				class="border-border bg-popover absolute top-full right-16 left-0 z-50 mt-1 max-h-48 overflow-y-auto rounded-md border shadow-lg"
			>
				{#each filteredSuggestions() as suggestion, index (suggestion)}
					<button
						type="button"
						class="hover:bg-accent hover:text-accent-foreground w-full px-3 py-2 text-left text-sm transition-colors"
						class:bg-accent={index === selectedSuggestionIndex}
						class:text-accent-foreground={index === selectedSuggestionIndex}
						onclick={() => handleSuggestionClick(suggestion)}
						onmouseenter={() => (selectedSuggestionIndex = index)}
					>
						{suggestion}
					</button>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Help Text -->
	{#if !disabled}
		<div class="text-muted-foreground text-xs">
			Press <kbd class="rounded border px-1">Enter</kbd> or <kbd class="rounded border px-1">,</kbd>
			to add tags
			{#if suggestions.length > 0}
				• Use <kbd class="rounded border px-1">↑</kbd><kbd class="rounded border px-1">↓</kbd> to navigate
				suggestions
			{/if}
		</div>
	{/if}
</div>
