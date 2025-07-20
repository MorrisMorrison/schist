<script lang="ts">
	import type { ToolbarProps, FormattingType } from '$lib/types/editor';
	import { Button } from '$lib/components/ui/button';
	import {
		Bold,
		Italic,
		Heading1,
		Heading2,
		Heading3,
		List,
		ListOrdered,
		Link,
		Code,
		Quote
	} from 'lucide-svelte';

	let {
		onFormat,
		theme = 'light',
		disabled = false
	}: Omit<ToolbarProps, 'onThemeToggle'> = $props();

	// Toolbar button configurations with Lucide icons
	const toolbarButtons = [
		{
			type: 'bold' as FormattingType,
			label: 'Bold',
			icon: Bold,
			shortcut: 'Ctrl+B',
			group: 'text'
		},
		{
			type: 'italic' as FormattingType,
			label: 'Italic',
			icon: Italic,
			shortcut: 'Ctrl+I',
			group: 'text'
		},
		{
			type: 'heading1' as FormattingType,
			label: 'Heading 1',
			icon: Heading1,
			shortcut: 'Ctrl+1',
			group: 'headings'
		},
		{
			type: 'heading2' as FormattingType,
			label: 'Heading 2',
			icon: Heading2,
			shortcut: 'Ctrl+2',
			group: 'headings'
		},
		{
			type: 'heading3' as FormattingType,
			label: 'Heading 3',
			icon: Heading3,
			shortcut: 'Ctrl+3',
			group: 'headings'
		},
		{
			type: 'bulletList' as FormattingType,
			label: 'Bullet List',
			icon: List,
			shortcut: 'Ctrl+Shift+8',
			group: 'lists'
		},
		{
			type: 'numberedList' as FormattingType,
			label: 'Numbered List',
			icon: ListOrdered,
			shortcut: 'Ctrl+Shift+7',
			group: 'lists'
		},
		{
			type: 'link' as FormattingType,
			label: 'Insert Link',
			icon: Link,
			shortcut: 'Ctrl+K',
			group: 'insert'
		},
		{
			type: 'code' as FormattingType,
			label: 'Inline Code',
			icon: Code,
			shortcut: 'Ctrl+`',
			group: 'insert'
		},
		{
			type: 'quote' as FormattingType,
			label: 'Quote Block',
			icon: Quote,
			shortcut: 'Ctrl+Shift+>',
			group: 'insert'
		}
	];

	// Group buttons for better organization
	const buttonGroups = $derived(() => {
		const groups: Record<string, typeof toolbarButtons> = {};
		toolbarButtons.forEach(button => {
			if (!groups[button.group]) {
				groups[button.group] = [];
			}
			groups[button.group].push(button);
		});
		return groups;
	});

	// Individual group accessors for cleaner template
	const textButtons = $derived(buttonGroups().text || []);
	const headingButtons = $derived(buttonGroups().headings || []);
	const listButtons = $derived(buttonGroups().lists || []);
	const insertButtons = $derived(buttonGroups().insert || []);

	// Theme classes
	const themeClasses = $derived(
		theme === 'dark'
			? 'bg-card border-border text-foreground'
			: 'bg-card border-border text-foreground'
	);

	// Handle button click
	function handleButtonClick(type: FormattingType) {
		if (disabled) return;

		if (type === 'link') {
			const url = prompt('Enter URL:');
			if (url) {
				onFormat(type, url);
			}
		} else {
			onFormat(type);
		}
	}

	// Theme toggle is now handled globally in the navigation
</script>

<div
	class="editor-toolbar flex items-center gap-3 border-b p-3 {themeClasses}"
	role="toolbar"
	aria-label="Formatting toolbar"
>
	<!-- Text Formatting Group -->
	<div class="flex items-center gap-1">
		{#each textButtons as button (button.type)}
			<Button
				variant="ghost"
				size="sm"
				onclick={() => handleButtonClick(button.type)}
				title="{button.label} ({button.shortcut})"
				aria-label={button.label}
				{disabled}
				class="h-8 w-8 p-0"
			>
				{@const IconComponent = button.icon}
				<IconComponent class="h-4 w-4" />
			</Button>
		{/each}
	</div>

	<div class="w-px h-6 bg-border"></div>

	<!-- Headings Group -->
	<div class="flex items-center gap-1">
		{#each headingButtons as button (button.type)}
			<Button
				variant="ghost"
				size="sm"
				onclick={() => handleButtonClick(button.type)}
				title="{button.label} ({button.shortcut})"
				aria-label={button.label}
				{disabled}
				class="h-8 w-8 p-0"
			>
				{@const IconComponent = button.icon}
				<IconComponent class="h-4 w-4" />
			</Button>
		{/each}
	</div>

	<div class="w-px h-6 bg-border"></div>

	<!-- Lists Group -->
	<div class="flex items-center gap-1">
		{#each listButtons as button (button.type)}
			<Button
				variant="ghost"
				size="sm"
				onclick={() => handleButtonClick(button.type)}
				title="{button.label} ({button.shortcut})"
				aria-label={button.label}
				{disabled}
				class="h-8 w-8 p-0"
			>
				{@const IconComponent = button.icon}
				<IconComponent class="h-4 w-4" />
			</Button>
		{/each}
	</div>

	<div class="w-px h-6 bg-border"></div>

	<!-- Insert Group -->
	<div class="flex items-center gap-1">
		{#each insertButtons as button (button.type)}
			<Button
				variant="ghost"
				size="sm"
				onclick={() => handleButtonClick(button.type)}
				title="{button.label} ({button.shortcut})"
				aria-label={button.label}
				{disabled}
				class="h-8 w-8 p-0"
			>
				{@const IconComponent = button.icon}
				<IconComponent class="h-4 w-4" />
			</Button>
		{/each}
	</div>

	<!-- Spacer -->
	<div class="flex-1"></div>

	<!-- Helpful hint -->
	<div class="text-xs text-muted-foreground hidden sm:block">
		Use keyboard shortcuts for faster formatting
	</div>
</div>

<style>
	/* Ensure consistent toolbar heights */
	.editor-toolbar {
		min-height: 3.5rem;
	}

	/* Make toolbar responsive */
	@media (max-width: 640px) {
		.editor-toolbar {
			flex-wrap: wrap;
			gap: 0.5rem;
			padding: 0.75rem;
		}
		
		/* Hide separators on mobile */
		.editor-toolbar .w-px {
			display: none;
		}
		
		/* Hide hint text on very small screens */
		.editor-toolbar .text-xs {
			display: none;
		}
	}
</style>
