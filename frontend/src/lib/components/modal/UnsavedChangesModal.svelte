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
					Saving...
				{:else}
					Save
				{/if}
			</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>