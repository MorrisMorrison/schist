<script lang="ts">
	// Shown when a save was refused because the page changed, was deleted or
	// became unreadable since the editor opened it (a GitHub sync or another
	// user). Autosave is paused meanwhile.
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
		reason?: 'changed' | 'deleted' | 'unreadable';
		/** For a deleted or unreadable page: drop my edits (copied to the clipboard first). */
		onDiscard?: () => void;
		/** Why the last choice did not go through (it is hidden behind the dialog otherwise). */
		error?: string;
		/** A choice is running: the buttons wait. */
		busy?: boolean;
		/** Closes the dialog to fix something by hand; the next save asks again. */
		onBack?: () => void;
	}

	let {
		open,
		onLoadCurrent,
		onKeepMine,
		reason = 'changed',
		onDiscard,
		error = '',
		busy = false,
		onBack
	}: Props = $props();
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
			{#if reason === 'deleted'}
				<DialogTitle>This page was deleted since you opened it</DialogTitle>
				<DialogDescription>
					It was deleted on GitHub or by someone else. Keep yours to save it as the page again, or
					discard your changes (your text is copied to the clipboard first).
				</DialogDescription>
			{:else if reason === 'unreadable'}
				<DialogTitle>This page can no longer be read</DialogTitle>
				<DialogDescription>
					It was changed on GitHub or by someone else so that Schist can't read it. Keep yours to
					overwrite it, or discard your changes (your text is copied to the clipboard first).
				</DialogDescription>
			{:else}
				<DialogTitle>This page changed since you opened it</DialogTitle>
				<DialogDescription>
					It was changed on GitHub or by someone else. Load the new version (your text is copied to
					the clipboard first), or keep yours (the other version stays in the page's history).
				</DialogDescription>
			{/if}
		</DialogHeader>
		{#if error}
			<p class="text-destructive text-sm" role="alert">{error}</p>
		{/if}
		<DialogFooter>
			{#if onBack}
				<Button variant="ghost" disabled={busy} onclick={onBack}>Back to editor</Button>
			{/if}
			<Button variant="outline" disabled={busy} onclick={onKeepMine}>Keep mine</Button>
			{#if reason === 'changed'}
				<Button disabled={busy} onclick={onLoadCurrent}>Load the new version</Button>
			{:else}
				<Button disabled={busy} onclick={() => onDiscard?.()}>Discard my changes</Button>
			{/if}
		</DialogFooter>
	</DialogContent>
</Dialog>
