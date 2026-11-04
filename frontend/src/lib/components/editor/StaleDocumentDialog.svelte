<script lang="ts">
	// Shown when a save was refused because the page changed since the editor
	// opened it (a GitHub sync or another user). Autosave is paused meanwhile.
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
		onLoadCurrent: () => void;
		onKeepMine: () => void;
	}

	let { open, onLoadCurrent, onKeepMine }: Props = $props();
</script>

<Dialog {open}>
	<DialogContent
		class="sm:max-w-md"
		showCloseButton={false}
		data-testid="stale-document-dialog"
		onInteractOutside={(e) => e.preventDefault()}
		onEscapeKeydown={(e) => e.preventDefault()}
	>
		<DialogHeader>
			<DialogTitle>This page changed since you opened it</DialogTitle>
			<DialogDescription>
				It was changed on GitHub or by someone else. Load the new version (your text is copied to
				the clipboard first), or keep yours (the other version stays in the page's history).
			</DialogDescription>
		</DialogHeader>
		<DialogFooter>
			<Button variant="outline" onclick={onKeepMine}>Keep mine</Button>
			<Button onclick={onLoadCurrent}>Load the new version</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>
