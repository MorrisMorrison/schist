<script lang="ts">
	import { KEYBOARD_SHORTCUTS } from '$lib/utils/keyboard-shortcuts';
	import { Dialog, DialogContent, DialogHeader, DialogTitle } from '$lib/components/ui/dialog';

	interface Props {
		open: boolean;
		onClose: () => void;
	}

	let { open, onClose }: Props = $props();
</script>

{#snippet section(title: string, shortcuts: Record<string, string>)}
	<div>
		<h3 class="text-foreground mb-3 text-lg font-medium">{title}</h3>
		<div class="space-y-2">
			{#each Object.entries(shortcuts) as [shortcut, description] (shortcut)}
				<div class="flex items-center justify-between">
					<span class="text-muted-foreground text-sm">{description}</span>
					<kbd class="bg-muted text-muted-foreground rounded border px-2 py-1 font-mono text-xs">
						{shortcut}
					</kbd>
				</div>
			{/each}
		</div>
	</div>
{/snippet}

<Dialog {open} onOpenChange={(isOpen) => !isOpen && onClose()}>
	<DialogContent class="bg-card gap-0 p-0 shadow-2xl sm:max-w-2xl">
		<DialogHeader class="border-border border-b px-6 py-4">
			<DialogTitle class="text-foreground text-xl">Keyboard Shortcuts</DialogTitle>
		</DialogHeader>

		<div class="max-h-96 overflow-y-auto px-6 py-4">
			<div class="space-y-6">
				{@render section('Navigation', KEYBOARD_SHORTCUTS.navigation)}
				{@render section('Document Actions', {
					...KEYBOARD_SHORTCUTS.creation,
					...KEYBOARD_SHORTCUTS.document
				})}
				{@render section('UI Controls', KEYBOARD_SHORTCUTS.ui)}
			</div>
		</div>

		<div class="border-border border-t px-6 py-4">
			<div class="text-muted-foreground flex items-center justify-between text-sm">
				<span
					>💡 Tip: Press <kbd class="bg-muted rounded border px-1 font-mono text-xs"
						>Cmd/Ctrl + K</kbd
					> to open Quick Switcher</span
				>
				<span
					>Press <kbd class="bg-muted rounded border px-1 font-mono text-xs">Escape</kbd> to close</span
				>
			</div>
		</div>
	</DialogContent>
</Dialog>
