<script lang="ts">
	import {
		History,
		GitCompare,
		Undo,
		Calendar,
		User,
		MessageSquare,
		Loader2
	} from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import {
		Dialog,
		DialogContent,
		DialogHeader,
		DialogTitle,
		DialogFooter
	} from '$lib/components/ui/dialog';
	import DiffViewer from './DiffViewer.svelte';
	import type { DocumentVersion, DiffResult } from '$lib/api/types';
	import { apiClient } from '$lib/api/client';
	import { getErrorMessage } from '$lib/utils/error';

	interface Props {
		open: boolean;
		path: string;
		versions: DocumentVersion[];
		onClose: () => void;
		onRestore?: (version: DocumentVersion) => void | Promise<void>;
	}

	let { open, path, versions, onClose, onRestore = () => {} }: Props = $props();

	// State management
	let selectedVersion1 = $state<DocumentVersion | null>(null);
	let selectedVersion2 = $state<DocumentVersion | null>(null);
	let diffResult = $state<DiffResult | null>(null);
	let showDiff = $state(false);
	let isLoadingDiff = $state(false);
	let isRestoring = $state(false);
	let restoreVersion = $state<DocumentVersion | null>(null);
	let showRestoreConfirm = $state(false);
	let diffError = $state<string | null>(null);

	function formatDate(dateString: string): string {
		const date = new Date(dateString);
		return date.toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function formatHash(hash: string): string {
		return hash.substring(0, 8);
	}

	function selectVersionForComparison(version: DocumentVersion) {
		if (!selectedVersion1) {
			selectedVersion1 = version;
		} else if (!selectedVersion2 && version.hash !== selectedVersion1.hash) {
			selectedVersion2 = version;
		} else {
			// Reset selection and start over
			selectedVersion1 = version;
			selectedVersion2 = null;
		}
	}

	function clearSelection() {
		selectedVersion1 = null;
		selectedVersion2 = null;
		showDiff = false;
		diffResult = null;
		diffError = null;
	}

	async function compareVersions() {
		if (!selectedVersion1 || !selectedVersion2) return;

		isLoadingDiff = true;
		diffError = null;

		try {
			diffResult = await apiClient.compareDocumentVersions(
				path,
				selectedVersion1.hash,
				selectedVersion2.hash
			);
			showDiff = true;
		} catch (error) {
			console.error('Failed to compare versions:', error);
			diffError = getErrorMessage(error, 'Failed to compare versions');
		} finally {
			isLoadingDiff = false;
		}
	}

	function showRestoreModal(version: DocumentVersion) {
		restoreVersion = version;
		showRestoreConfirm = true;
	}

	async function confirmRestore() {
		if (!restoreVersion) return;

		isRestoring = true;
		try {
			await onRestore(restoreVersion);
			showRestoreConfirm = false;
			onClose();
		} catch (error) {
			console.error('Failed to restore version:', error);
		} finally {
			isRestoring = false;
		}
	}

	function cancelRestore() {
		showRestoreConfirm = false;
		restoreVersion = null;
		isRestoring = false;
	}

	function isVersionSelected(version: DocumentVersion): boolean {
		return version.hash === selectedVersion1?.hash || version.hash === selectedVersion2?.hash;
	}

	function closeDiff() {
		showDiff = false;
		diffResult = null;
		diffError = null;
	}
</script>

<Dialog {open} onOpenChange={(isOpen) => !isOpen && onClose()}>
	<DialogContent
		class="flex max-h-[90vh] {showDiff ? 'max-w-7xl' : 'max-w-4xl'} flex-col overflow-hidden"
		showCloseButton={!showDiff}
	>
		{#if showDiff && diffResult}
			<!-- Diff View -->
			<DialogHeader>
				<DialogTitle class="flex items-center gap-2">
					<GitCompare class="h-5 w-5" />
					Comparing Versions
				</DialogTitle>
				<div class="text-muted-foreground flex items-center gap-4 text-sm">
					<div class="flex items-center gap-2">
						<Badge variant="outline">{formatHash(diffResult.hash1)}</Badge>
						<span>vs</span>
						<Badge variant="outline">{formatHash(diffResult.hash2)}</Badge>
					</div>
					<div class="flex items-center gap-4">
						<span class="text-green-600">+{diffResult.summary.additions}</span>
						<span class="text-red-600">-{diffResult.summary.deletions}</span>
						<span class="text-yellow-600">~{diffResult.summary.modifications}</span>
					</div>
				</div>
			</DialogHeader>

			<div class="min-h-0 flex-1 overflow-hidden">
				<DiffViewer {diffResult} />
			</div>

			<DialogFooter>
				<Button variant="outline" onclick={closeDiff}>Close Diff</Button>
			</DialogFooter>
		{:else if showRestoreConfirm && restoreVersion}
			<!-- Restore Confirmation -->
			<DialogHeader>
				<DialogTitle>Restore Version</DialogTitle>
			</DialogHeader>

			<div class="py-4">
				<p class="mb-4">Are you sure you want to restore to this version?</p>
				<div class="bg-muted rounded-lg p-4">
					<div class="mb-2 flex items-center gap-2">
						<Badge variant="outline">{formatHash(restoreVersion.hash)}</Badge>
						<span class="text-muted-foreground text-sm">{formatDate(restoreVersion.timestamp)}</span
						>
					</div>
					{#if restoreVersion.author}
						<div class="mb-2 flex items-center gap-2">
							<User class="h-4 w-4" />
							<span class="text-sm">{restoreVersion.author}</span>
						</div>
					{/if}
					{#if restoreVersion.message}
						<div class="flex items-start gap-2">
							<MessageSquare class="mt-0.5 h-4 w-4" />
							<span class="text-sm">{restoreVersion.message}</span>
						</div>
					{/if}
				</div>
				<p class="text-muted-foreground mt-4 text-sm">
					This will create a new version with the content from the selected version.
				</p>
			</div>

			<DialogFooter>
				<Button variant="outline" onclick={cancelRestore} disabled={isRestoring}>Cancel</Button>
				<Button onclick={confirmRestore} disabled={isRestoring}>
					{#if isRestoring}
						<Loader2 class="h-4 w-4 animate-spin" />
						Restoring...
					{:else}
						<Undo class="h-4 w-4" />
						Restore
					{/if}
				</Button>
			</DialogFooter>
		{:else}
			<!-- Version History List -->
			<DialogHeader>
				<DialogTitle class="flex items-center gap-2">
					<History class="h-5 w-5" />
					Version History
				</DialogTitle>
				{#if selectedVersion1 || selectedVersion2}
					<div class="flex items-center gap-2 text-sm">
						<span class="text-muted-foreground">Selected for comparison:</span>
						{#if selectedVersion1}
							<Badge variant="secondary">{formatHash(selectedVersion1.hash)}</Badge>
						{/if}
						{#if selectedVersion2}
							<Badge variant="secondary">{formatHash(selectedVersion2.hash)}</Badge>
						{/if}
					</div>
				{/if}
			</DialogHeader>

			<div class="flex-1 overflow-y-auto">
				{#if versions.length === 0}
					<div class="flex flex-col items-center justify-center py-8 text-center">
						<History class="text-muted-foreground mb-4 h-12 w-12" />
						<p class="text-muted-foreground">No version history available</p>
					</div>
				{:else}
					<div class="space-y-3">
						{#each versions as version (version.hash)}
							<div
								class="rounded-lg border p-4 transition-colors {isVersionSelected(version)
									? 'bg-primary/5 border-primary'
									: 'hover:bg-muted/50'}"
							>
								<div class="mb-3 flex items-start justify-between">
									<div class="flex items-center gap-3">
										<Badge variant="outline" class="font-mono text-xs">
											{formatHash(version.hash)}
										</Badge>
										<div class="text-muted-foreground flex items-center gap-2 text-sm">
											<Calendar class="h-4 w-4" />
											<span>{formatDate(version.timestamp)}</span>
										</div>
									</div>
									<div class="flex gap-2">
										<Button
											size="sm"
											variant="outline"
											onclick={() => selectVersionForComparison(version)}
											class="text-xs"
										>
											{isVersionSelected(version) ? 'Selected' : 'Select'}
										</Button>
										<Button
											size="sm"
											variant="ghost"
											onclick={() => showRestoreModal(version)}
											class="text-xs"
										>
											<Undo class="h-3 w-3" />
											Restore
										</Button>
									</div>
								</div>

								{#if version.author}
									<div class="mb-2 flex items-center gap-2">
										<User class="text-muted-foreground h-4 w-4" />
										<span class="text-sm">{version.author}</span>
									</div>
								{/if}

								{#if version.message}
									<div class="flex items-start gap-2">
										<MessageSquare class="text-muted-foreground mt-0.5 h-4 w-4" />
										<span class="text-sm">{version.message}</span>
									</div>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</div>

			{#if diffError}
				<div class="bg-destructive/10 border-destructive/20 rounded-lg border p-3">
					<p class="text-destructive text-sm">{diffError}</p>
				</div>
			{/if}

			<DialogFooter>
				<div class="flex w-full justify-between">
					<div class="flex gap-2">
						{#if selectedVersion1 && selectedVersion2}
							<Button onclick={compareVersions} disabled={isLoadingDiff}>
								{#if isLoadingDiff}
									<Loader2 class="h-4 w-4 animate-spin" />
									Loading...
								{:else}
									<GitCompare class="h-4 w-4" />
									Compare
								{/if}
							</Button>
						{/if}
						{#if selectedVersion1 || selectedVersion2}
							<Button variant="outline" onclick={clearSelection}>Clear Selection</Button>
						{/if}
					</div>
					<Button variant="outline" onclick={onClose}>Close</Button>
				</div>
			</DialogFooter>
		{/if}
	</DialogContent>
</Dialog>
