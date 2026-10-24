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
		Quote,
		Maximize,
		Minimize
	} from '@lucide/svelte';

	let {
		onFormat,
		disabled = false,
		onFullscreenToggle,
		isFullscreen = false
	}: ToolbarProps = $props();

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

	const buttonGroups = $derived.by(() => {
		const groups: Record<string, typeof toolbarButtons> = {};
		toolbarButtons.forEach((button) => {
			if (!groups[button.group]) {
				groups[button.group] = [];
			}
			groups[button.group].push(button);
		});
		return groups;
	});

	const textButtons = $derived(buttonGroups.text || []);
	const headingButtons = $derived(buttonGroups.headings || []);
	const listButtons = $derived(buttonGroups.lists || []);
	const insertButtons = $derived(buttonGroups.insert || []);

	const themeClasses = 'bg-card border-border text-foreground';

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
</script>

<div
	class="editor-toolbar flex items-center gap-3 border-b p-3 {themeClasses}"
	role="toolbar"
	aria-label="Formatting toolbar"
>
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

	<div class="bg-border h-6 w-px"></div>

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

	<div class="bg-border h-6 w-px"></div>

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

	<div class="bg-border h-6 w-px"></div>

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

	<div class="flex-1"></div>

	{#if onFullscreenToggle}
		<Button
			variant="ghost"
			size="sm"
			onclick={onFullscreenToggle}
			title={isFullscreen ? 'Exit Fullscreen (F11)' : 'Enter Fullscreen (F11)'}
			aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
			{disabled}
			class="h-8 w-8 p-0"
		>
			{#if isFullscreen}
				<Minimize class="h-4 w-4" />
			{:else}
				<Maximize class="h-4 w-4" />
			{/if}
		</Button>
	{/if}

	<div class="text-muted-foreground hidden text-xs sm:block">
		Use keyboard shortcuts for faster formatting
	</div>
</div>

<style>
	.editor-toolbar {
		min-height: 3.5rem;
	}

	@media (max-width: 640px) {
		.editor-toolbar {
			flex-wrap: wrap;
			gap: 0.5rem;
			padding: 0.75rem;
		}

		.editor-toolbar .w-px {
			display: none;
		}

		.editor-toolbar .text-xs {
			display: none;
		}
	}
</style>
