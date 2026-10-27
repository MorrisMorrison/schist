<script lang="ts">
	import { Loader2 } from '@lucide/svelte';
	import { Button } from '#lib/components/ui/button/index.ts';
	import {
		Dialog,
		DialogContent,
		DialogHeader,
		DialogTitle,
		DialogFooter,
		DialogDescription
	} from '#lib/components/ui/dialog/index.ts';

	interface Props {
		open: boolean;
		documentTitle?: string;
		onSave: () => Promise<void>;
		onDiscard: () => void;
		onCancel: () => void;
		isSaving?: boolean;
	}

	let {
		open,
		documentTitle = 'this document',
		onSave,
		onDiscard,
		onCancel,
		isSaving = false
	}: Props = $props();

	async function handleSave() {
		await onSave();
	}

	function handleDiscard() {
		onDiscard();
	}

	function handleCancel() {
		onCancel();
	}
</script>

<Dialog {open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
	<DialogContent data-testid="unsaved-changes-dialog">
		<DialogHeader>
			<DialogTitle>Unsaved Changes</DialogTitle>
			<DialogDescription>
				You have unsaved changes to <strong>{documentTitle}</strong>. What would you like to do?
			</DialogDescription>
		</DialogHeader>
		<DialogFooter class="flex-col gap-2 sm:flex-row sm:justify-end sm:gap-2">
			<Button
				variant="outline"
				onclick={handleCancel}
				disabled={isSaving}
				data-testid="cancel-navigation-button"
				class="w-full sm:w-auto"
			>
				Cancel
			</Button>
			<Button
				variant="destructive"
				onclick={handleDiscard}
				disabled={isSaving}
				data-testid="discard-and-continue-button"
				class="w-full sm:w-auto"
			>
				Discard
			</Button>
			<Button
				variant="default"
				onclick={handleSave}
				disabled={isSaving}
				data-testid="save-and-continue-button"
				class="w-full sm:w-auto"
			>
				{#if isSaving}
					<Loader2 class="h-4 w-4 animate-spin" />
					Saving...
				{:else}
					Save
				{/if}
			</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>
