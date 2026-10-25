<script lang="ts">
	import { KEYBOARD_SHORTCUTS } from '$lib/utils/keyboard-shortcuts';
	import { X } from '@lucide/svelte';

	interface Props {
		open: boolean;
		onClose: () => void;
	}

	let { open, onClose }: Props = $props();

	let dialog = $state<HTMLDivElement>();

	// Take focus on open so Escape (and screen readers) work however the dialog
	// was opened, including from the "?" shortcut with focus still on the page.
	$effect(() => {
		if (open) dialog?.focus();
	});

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			onClose();
		}
	}
</script>

{#if open}
	<div
		bind:this={dialog}
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 outline-none"
		onclick={(e) => {
			if (e.target === e.currentTarget) onClose();
		}}
		onkeydown={handleKeydown}
		role="dialog"
		aria-modal="true"
		aria-label="Keyboard shortcuts"
		tabindex="-1"
	>
		<div
			class="bg-card border-border relative w-full max-w-2xl rounded-lg border shadow-2xl"
			role="document"
		>
			<!-- Header -->
			<div class="border-border flex items-center justify-between border-b px-6 py-4">
				<h2 class="text-foreground text-xl font-semibold">Keyboard Shortcuts</h2>
				<button
					type="button"
					onclick={onClose}
					class="text-muted-foreground hover:text-foreground rounded-md p-1 transition-colors"
					aria-label="Close"
				>
					<X class="h-5 w-5" />
				</button>
			</div>

			<!-- Content -->
			<div class="max-h-96 overflow-y-auto px-6 py-4">
				<div class="space-y-6">
					<!-- Navigation Shortcuts -->
					<div>
						<h3 class="text-foreground mb-3 text-lg font-medium">Navigation</h3>
						<div class="space-y-2">
							{#each Object.entries(KEYBOARD_SHORTCUTS.navigation) as [shortcut, description] (shortcut)}
								<div class="flex items-center justify-between">
									<span class="text-muted-foreground text-sm">{description}</span>
									<kbd
										class="bg-muted text-muted-foreground rounded border px-2 py-1 font-mono text-xs"
									>
										{shortcut}
									</kbd>
								</div>
							{/each}
						</div>
					</div>

					<!-- Document Actions -->
					<div>
						<h3 class="text-foreground mb-3 text-lg font-medium">Document Actions</h3>
						<div class="space-y-2">
							{#each Object.entries(KEYBOARD_SHORTCUTS.creation) as [shortcut, description] (shortcut)}
								<div class="flex items-center justify-between">
									<span class="text-muted-foreground text-sm">{description}</span>
									<kbd
										class="bg-muted text-muted-foreground rounded border px-2 py-1 font-mono text-xs"
									>
										{shortcut}
									</kbd>
								</div>
							{/each}
							{#each Object.entries(KEYBOARD_SHORTCUTS.document) as [shortcut, description] (shortcut)}
								<div class="flex items-center justify-between">
									<span class="text-muted-foreground text-sm">{description}</span>
									<kbd
										class="bg-muted text-muted-foreground rounded border px-2 py-1 font-mono text-xs"
									>
										{shortcut}
									</kbd>
								</div>
							{/each}
						</div>
					</div>

					<!-- UI Controls -->
					<div>
						<h3 class="text-foreground mb-3 text-lg font-medium">UI Controls</h3>
						<div class="space-y-2">
							{#each Object.entries(KEYBOARD_SHORTCUTS.ui) as [shortcut, description] (shortcut)}
								<div class="flex items-center justify-between">
									<span class="text-muted-foreground text-sm">{description}</span>
									<kbd
										class="bg-muted text-muted-foreground rounded border px-2 py-1 font-mono text-xs"
									>
										{shortcut}
									</kbd>
								</div>
							{/each}
						</div>
					</div>
				</div>
			</div>

			<!-- Footer -->
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
		</div>
	</div>
{/if}
