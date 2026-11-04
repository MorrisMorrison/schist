<script lang="ts">
	// Backup only (push) or two-way sync (also pull edits made elsewhere, e.g.
	// Obsidian). Switching on shows what the first sync would do first.
	import * as Dialog from '#lib/components/ui/dialog/index.ts';
	import * as RadioGroup from '#lib/components/ui/radio-group/index.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import { Label } from '#lib/components/ui/label/index.ts';
	import { githubActions, githubStore } from '#lib/stores/github.svelte.ts';
	import { getErrorMessage } from '#lib/utils/error.ts';
	import type { PreviewChange, SyncPreview } from '#lib/api/types.ts';

	const twoWay = $derived(githubStore.settings?.mode === 'two-way');
	let preview = $state<SyncPreview | null>(null);
	let busy = $state(false);
	let error = $state('');

	const incomingGroups: { action: PreviewChange['action']; label: string }[] = [
		{ action: 'delete', label: 'Deleted from the wiki' },
		{ action: 'add', label: 'New in the wiki' },
		{ action: 'change', label: 'Changed in the wiki' }
	];

	const groups = $derived.by(() => {
		if (!preview) return [];
		const { incoming, outgoing, conflicts, unreadable } = preview;
		return [
			...incomingGroups.map(({ action, label }) => ({
				label,
				warn: action === 'delete',
				items: incoming
					.filter((c) => c.action === action)
					.map((c) => (c.page ? c.path : `${c.path} (file)`))
			})),
			{ label: 'Goes to GitHub', warn: false, items: outgoing },
			{ label: 'Changed in both places (you pick a side)', warn: false, items: conflicts },
			{ label: 'Not readable by Schist (kept, not shown)', warn: false, items: unreadable }
		].filter((g) => g.items.length > 0);
	});

	async function chooseTwoWay() {
		if (twoWay || busy) return;
		busy = true;
		error = '';
		try {
			preview = await githubActions.previewSync();
		} catch (err) {
			error = getErrorMessage(err, 'Could not check GitHub');
		} finally {
			busy = false;
		}
	}

	async function confirmTwoWay() {
		busy = true;
		error = '';
		try {
			await githubActions.updateSettings({ mode: 'two-way' });
			preview = null;
			await githubActions.syncToGitHub().catch(() => {}); // a pause shows in the conflicts list
		} catch (err) {
			preview = null;
			error = getErrorMessage(err, 'Could not turn on two-way sync');
		} finally {
			busy = false;
		}
	}

	async function chooseBackup() {
		if (!twoWay || busy) return;
		error = '';
		try {
			await githubActions.updateSettings({ mode: 'backup' });
		} catch (err) {
			error = getErrorMessage(err, 'Could not switch to backup only');
		}
	}

	function onValueChange(value: string) {
		if (value === 'two-way') void chooseTwoWay();
		else void chooseBackup();
	}
</script>

<div class="space-y-2">
	<Label id="sync-mode-label">Sync mode</Label>
	<RadioGroup.Root
		class="gap-3"
		aria-labelledby="sync-mode-label"
		bind:value={() => (twoWay ? 'two-way' : 'backup'), onValueChange}
	>
		<div class="flex items-start gap-2">
			<RadioGroup.Item
				id="sync-mode-backup"
				value="backup"
				class="mt-1"
				data-testid="sync-mode-backup"
			/>
			<Label for="sync-mode-backup" class="block font-normal">
				<span class="font-medium">Backup only</span>
				<span class="text-muted-foreground block text-sm">Schist pushes; GitHub is a copy.</span>
			</Label>
		</div>
		<div class="flex items-start gap-2">
			<RadioGroup.Item
				id="sync-mode-two-way"
				value="two-way"
				class="mt-1"
				disabled={busy}
				data-testid="sync-mode-two-way"
			/>
			<Label for="sync-mode-two-way" class="block font-normal">
				<span class="font-medium">Two-way sync</span>
				<span class="text-muted-foreground block text-sm">
					Also brings in changes made on GitHub or in a clone (for example Obsidian), every 5
					minutes.
				</span>
			</Label>
		</div>
	</RadioGroup.Root>
	{#if error}<p class="text-destructive text-sm" role="alert">{error}</p>{/if}
</div>

<Dialog.Root open={preview !== null} onOpenChange={(open) => !open && (preview = null)}>
	<Dialog.Content class="sm:max-w-lg" data-testid="sync-preview-dialog">
		<Dialog.Header>
			<Dialog.Title>Turn on two-way sync?</Dialog.Title>
			<Dialog.Description>This is what the first sync would do.</Dialog.Description>
		</Dialog.Header>
		{#if preview}
			{#each groups as group (group.label)}
				<div>
					<h4 class="text-sm font-medium {group.warn ? 'text-destructive' : ''}">
						{group.label} ({group.items.length})
					</h4>
					<ul class="text-muted-foreground max-h-32 overflow-y-auto font-mono text-xs">
						{#each group.items as item (item)}<li>{item}</li>{/each}
					</ul>
				</div>
			{:else}
				<p class="text-muted-foreground text-sm">Nothing to change: both sides already match.</p>
			{/each}
		{/if}
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (preview = null)}>Cancel</Button>
			<Button onclick={confirmTwoWay} disabled={busy}>Turn on two-way sync</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
