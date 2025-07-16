<script lang="ts">
	import type { ToolbarProps, FormattingType } from '$lib/types/editor';

	let {
		onFormat,
		theme = 'light',
		disabled = false
	}: Omit<ToolbarProps, 'onThemeToggle'> = $props();

	// Toolbar button configurations
	const toolbarButtons = [
		{
			type: 'bold' as FormattingType,
			label: 'Bold',
			icon: 'B',
			shortcut: 'Ctrl+B',
			className: 'font-bold'
		},
		{
			type: 'italic' as FormattingType,
			label: 'Italic',
			icon: 'I',
			shortcut: 'Ctrl+I',
			className: 'italic'
		},
		{
			type: 'heading1' as FormattingType,
			label: 'Heading 1',
			icon: 'H1',
			shortcut: 'Ctrl+1'
		},
		{
			type: 'heading2' as FormattingType,
			label: 'Heading 2',
			icon: 'H2',
			shortcut: 'Ctrl+2'
		},
		{
			type: 'heading3' as FormattingType,
			label: 'Heading 3',
			icon: 'H3',
			shortcut: 'Ctrl+3'
		},
		{
			type: 'bulletList' as FormattingType,
			label: 'Bullet List',
			icon: '•',
			shortcut: 'Ctrl+Shift+8'
		},
		{
			type: 'numberedList' as FormattingType,
			label: 'Numbered List',
			icon: '1.',
			shortcut: 'Ctrl+Shift+7'
		},
		{
			type: 'link' as FormattingType,
			label: 'Link',
			icon: '🔗',
			shortcut: 'Ctrl+K'
		},
		{
			type: 'code' as FormattingType,
			label: 'Code',
			icon: '</>',
			shortcut: 'Ctrl+`'
		},
		{
			type: 'quote' as FormattingType,
			label: 'Quote',
			icon: '"',
			shortcut: 'Ctrl+Shift+>'
		}
	];

	// Theme classes
	const themeClasses = $derived(
		theme === 'dark'
			? 'bg-gray-800 border-gray-700 text-gray-200'
			: 'bg-gray-50 border-gray-200 text-gray-700'
	);

	const buttonThemeClasses = $derived(
		theme === 'dark'
			? 'hover:bg-gray-700 focus:bg-gray-700 border-gray-600'
			: 'hover:bg-gray-100 focus:bg-gray-100 border-gray-300'
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
	class="editor-toolbar flex items-center gap-1 border-b p-2 {themeClasses}"
	role="toolbar"
	aria-label="Formatting toolbar"
>
	<!-- Formatting buttons -->
	{#each toolbarButtons as button (button.type)}
		<button
			class="toolbar-btn rounded border px-3 py-1.5 text-sm font-medium transition-colors duration-200
					focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:outline-none
					{buttonThemeClasses} {button.className || ''}"
			class:opacity-50={disabled}
			class:cursor-not-allowed={disabled}
			onclick={() => handleButtonClick(button.type)}
			title="{button.label} ({button.shortcut})"
			aria-label={button.label}
			{disabled}
		>
			<span class="select-none">{button.icon}</span>
		</button>
	{/each}

	<!-- Spacer -->
	<div class="flex-1"></div>

	<!-- Additional actions can go here -->
	<div class="text-xs {theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}">
		Use keyboard shortcuts for faster formatting
	</div>
</div>

<style>
	.toolbar-btn {
		min-width: 2rem;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.toolbar-btn:disabled {
		pointer-events: none;
	}

	.toolbar-btn:not(:disabled):active {
		transform: translateY(1px);
	}

	/* Improve accessibility */
	.toolbar-btn:focus {
		z-index: 10;
	}

	/* Ensure consistent button heights */
	.editor-toolbar {
		min-height: 3rem;
	}

	/* Make toolbar responsive */
	@media (max-width: 640px) {
		.editor-toolbar {
			flex-wrap: wrap;
			gap: 0.25rem;
		}

		.toolbar-btn {
			min-width: 1.75rem;
			padding: 0.375rem 0.5rem;
			font-size: 0.75rem;
		}
	}
</style>
