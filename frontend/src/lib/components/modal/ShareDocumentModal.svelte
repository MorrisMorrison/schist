<script lang="ts">
	import { formatDateTime } from '$lib/utils/date';
	import { Copy, Share, RefreshCw, Trash2, Clock, ExternalLink } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import { Dialog, DialogContent, DialogHeader, DialogTitle } from '$lib/components/ui/dialog';
	import { apiClient } from '$lib/api/client';
	import type { ShareToken } from '$lib/api/types';
	import { isUnauthorizedError } from '$lib/utils/error';
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';

	interface Props {
		open: boolean;
		documentPath: string;
		documentTitle: string;
		onclose?: () => void;
	}

	const { open, documentPath, documentTitle, onclose }: Props = $props();

	let shares = $state<ShareToken[]>([]);
	let loading = $state(false);
	let error = $state('');
	let success = $state('');
	let expiryDays = $state(7);
	const expiryItems = [
		{ value: '1', label: '1 day' },
		{ value: '7', label: '1 week' },
		{ value: '30', label: '1 month' },
		{ value: '90', label: '3 months' },
		{ value: '0', label: 'Never expires' }
	];

	// Load existing shares when modal opens
	$effect(() => {
		if (open) {
			loadShares();
		}
	});

	async function loadShares() {
		try {
			loading = true;
			error = '';
			const response = await apiClient.listShares();
			// Filter shares for this document, safely handle undefined/null response
			shares = (response.shares || []).filter((share) => share.document_path === documentPath);
		} catch (err) {
			// Don't show error for auth failures - just show empty shares list
			if (isUnauthorizedError(err)) {
				shares = [];
			} else {
				error = 'Failed to load shares';
				console.error('Failed to load shares:', err);
				// Ensure shares is still an array even on error
				shares = [];
			}
		} finally {
			loading = false;
		}
	}

	async function createShare() {
		try {
			loading = true;
			error = '';
			success = '';

			const share = await apiClient.createShare({
				document_path: documentPath,
				expiry_days: expiryDays
			});

			shares = [...shares, share];
			success = 'Share link created successfully!';
		} catch (err) {
			error = 'Failed to create share link';
			console.error('Failed to create share:', err);
		} finally {
			loading = false;
		}
	}

	async function revokeShare(shareId: string) {
		try {
			loading = true;
			error = '';
			success = '';

			await apiClient.revokeShare(shareId);
			shares = shares.filter((s) => s.id !== shareId);
			success = 'Share link revoked successfully!';
		} catch (err) {
			error = 'Failed to revoke share link';
			console.error('Failed to revoke share:', err);
		} finally {
			loading = false;
		}
	}

	async function copyToClipboard(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			success = 'Link copied to clipboard!';
			setTimeout(() => {
				success = '';
			}, 3000);
		} catch (err) {
			error = 'Failed to copy to clipboard';
			console.error('Failed to copy:', err);
		}
	}

	function isExpiringSoon(expiresAt: string): boolean {
		const expiryDate = new Date(expiresAt);
		const now = new Date();
		const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
		return expiryDate < threeDaysFromNow;
	}

	function handleClose() {
		onclose?.();
	}
</script>

<Dialog {open} onOpenChange={handleClose}>
	<DialogContent class="max-w-2xl">
		<DialogHeader>
			<DialogTitle class="flex items-center gap-2">
				<Share class="h-5 w-5" />
				Share "{documentTitle}"
			</DialogTitle>
		</DialogHeader>

		<div class="space-y-6">
			<!-- Success/Error Messages -->
			{#if success}
				<div class="bg-accent text-accent-foreground rounded-md p-3 text-sm">
					{success}
				</div>
			{/if}

			{#if error}
				<ErrorAlert {error} />
			{/if}

			<!-- Create New Share -->
			<div class="rounded-lg border p-4">
				<h3 class="mb-3 font-medium">Create New Share Link</h3>
				<div class="space-y-4">
					<div class="grid grid-cols-2 gap-3">
						<div>
							<Label for="expiry">Expiry</Label>
							<Select.Root
								type="single"
								items={expiryItems}
								bind:value={() => String(expiryDays), (value) => (expiryDays = Number(value))}
								disabled={loading}
							>
								<Select.Trigger id="expiry" class="w-full" data-testid="share-expiry-select">
									<Select.Value />
								</Select.Trigger>
								<Select.Content>
									{#each expiryItems as item (item.value)}
										<Select.Item {...item} />
									{/each}
								</Select.Content>
							</Select.Root>
						</div>
						<div class="flex items-end">
							<Button
								onclick={createShare}
								disabled={loading}
								class="w-full"
								data-testid="create-share-link"
							>
								{#if loading}
									<RefreshCw class="mr-2 h-4 w-4 animate-spin" />
								{:else}
									<Share class="mr-2 h-4 w-4" />
								{/if}
								Create Share Link
							</Button>
						</div>
					</div>
				</div>
			</div>

			<!-- Existing Shares -->
			<div class="space-y-3">
				<h3 class="font-medium">Active Share Links</h3>

				{#if loading && shares.length === 0}
					<div class="py-8 text-center">
						<RefreshCw class="text-muted-foreground mx-auto h-6 w-6 animate-spin" />
						<p class="text-muted-foreground mt-2 text-sm">Loading shares...</p>
					</div>
				{:else if shares.length === 0}
					<div class="rounded-lg border border-dashed p-8 text-center">
						<Share class="text-muted-foreground/50 mx-auto h-8 w-8" />
						<p class="text-muted-foreground mt-2 text-sm">No share links created yet</p>
						<p class="text-muted-foreground text-xs">
							Create a share link to allow others to view this document
						</p>
					</div>
				{:else}
					<div class="max-h-80 space-y-2 overflow-y-auto">
						{#each shares as share (share.id)}
							<div class="space-y-2 rounded-lg border p-4">
								<div class="flex items-center justify-between">
									<div class="flex items-center gap-2">
										<Clock class="text-muted-foreground h-4 w-4" />
										<span class="text-muted-foreground text-sm">
											{#if share.expires_at && new Date(share.expires_at) > new Date()}
												{#if isExpiringSoon(share.expires_at)}
													<span class="text-amber-600"
														>Expires {formatDateTime(share.expires_at)}</span
													>
												{:else}
													Expires {formatDateTime(share.expires_at)}
												{/if}
											{:else}
												Never expires
											{/if}
										</span>
									</div>
									<Button
										data-testId="revoke-share-btn"
										variant="ghost"
										size="sm"
										onclick={() => revokeShare(share.id)}
										disabled={loading}
									>
										<Trash2 class="h-4 w-4" />
									</Button>
								</div>

								<div class="flex gap-2">
									<Input
										value={share.share_url}
										readonly
										class="font-mono text-xs"
										data-testid="share-url"
									/>
									<Button size="sm" onclick={() => copyToClipboard(share.share_url)}>
										<Copy class="h-4 w-4" />
									</Button>
									<Button
										size="sm"
										variant="outline"
										onclick={() => window.open(share.share_url, '_blank')}
									>
										<ExternalLink class="h-4 w-4" />
									</Button>
								</div>

								<p class="text-muted-foreground text-xs">
									Created {formatDateTime(share.created_at)}
								</p>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Info -->
			<div class="bg-muted/50 rounded-lg p-3">
				<p class="text-muted-foreground text-xs">
					<strong>Share links:</strong> Allow anyone with the link to view this document in read-only
					mode. No authentication is required. Links can be revoked at any time.
				</p>
			</div>
		</div>
	</DialogContent>
</Dialog>
