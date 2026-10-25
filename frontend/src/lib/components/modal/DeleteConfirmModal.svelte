<script lang="ts">
	import { Loader2 } from '@lucide/svelte';
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
					<Loader2 class="h-4 w-4 animate-spin" />
					Deleting...
				{:else}
					{confirmText}
				{/if}
			</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>
