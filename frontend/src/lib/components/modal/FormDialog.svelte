<script lang="ts">
	// A small dialog around a form: icon + title, the fields, then Cancel and a
	// submit button that shows its busy label while the action runs.
	import type { Component, Snippet } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import {
		Dialog,
		DialogContent,
		DialogHeader,
		DialogTitle,
		DialogFooter
	} from '$lib/components/ui/dialog';

	interface Props {
		open: boolean;
		title: string;
		icon: Component<{ class?: string }>;
		submitLabel: string;
		busyLabel: string;
		busy: boolean;
		canSubmit: boolean;
		onSubmit: () => void;
		/** Escape, outside clicks and Cancel. */
		onClose: () => void;
		testId?: string;
		submitTestId?: string;
		cancelTestId?: string;
		children: Snippet;
	}

	let {
		open,
		title,
		icon: Icon,
		submitLabel,
		busyLabel,
		busy,
		canSubmit,
		onSubmit,
		onClose,
		testId,
		submitTestId,
		cancelTestId,
		children
	}: Props = $props();
</script>

<Dialog {open} onOpenChange={(openState) => !openState && onClose()}>
	<DialogContent class="max-w-md" data-testid={testId}>
		<DialogHeader>
			<DialogTitle class="flex items-center gap-3">
				<Icon class="h-5 w-5 text-blue-500" />
				{title}
			</DialogTitle>
		</DialogHeader>

		<form
			onsubmit={(e) => {
				e.preventDefault();
				onSubmit();
			}}
			class="space-y-6"
		>
			<div class="space-y-4">
				{@render children()}
			</div>

			<DialogFooter>
				<Button
					type="button"
					data-testid={cancelTestId}
					variant="outline"
					onclick={onClose}
					disabled={busy}
				>
					Cancel
				</Button>
				<Button type="submit" data-testid={submitTestId} disabled={!canSubmit || busy}>
					{busy ? busyLabel : submitLabel}
				</Button>
			</DialogFooter>
		</form>
	</DialogContent>
</Dialog>
