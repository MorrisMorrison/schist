<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import {
		Dialog,
		DialogContent,
		DialogHeader,
		DialogTitle,
		DialogFooter,
		DialogDescription
	} from '$lib/components/ui/dialog';

	interface Props {
		open: boolean;
		title?: string;
		description?: string;
		confirmText?: string;
		isDeleting?: boolean;
		onConfirm: () => void | Promise<void>;
		onCancel: () => void;
	}

	let {
		open,
		title = 'Delete Page',
		description = 'Are you sure you want to delete this page? This action cannot be undone.',
		confirmText = 'Delete',
		isDeleting = false,
		onConfirm,
		onCancel
	}: Props = $props();

	async function handleConfirm() {
		const result = onConfirm();
		// If onConfirm returns a promise, await it
		if (result && typeof result.then === 'function') {
			await result;
		}
	}
</script>

<Dialog {open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
	<DialogContent data-testid="confirm-dialog">
		<DialogHeader>
			<DialogTitle>{title}</DialogTitle>
			<DialogDescription>
				{description}
			</DialogDescription>
		</DialogHeader>
		<DialogFooter>
			<Button variant="outline" onclick={onCancel} disabled={isDeleting}>Cancel</Button>
			<Button
				variant="destructive"
				onclick={handleConfirm}
				disabled={isDeleting}
				data-testid="confirm-delete-button"
			>
				{#if isDeleting}
					<svg
						class="mr-2 h-4 w-4 animate-spin"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
						/>
					</svg>
					Deleting...
				{:else}
					{confirmText}
				{/if}
			</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>
