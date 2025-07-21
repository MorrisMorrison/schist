<script lang="ts">
	import { pageActions } from '$lib/stores/pages';
	import { Button } from '$lib/components/ui/button';
	import {
		Dialog,
		DialogContent,
		DialogHeader,
		DialogTitle,
		DialogFooter
	} from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Edit, AlertCircle } from 'lucide-svelte';
	import type { Page } from '$lib/api/types';

	interface Props {
		page?: Page;
		open?: boolean;
		onClose: () => void;
		onRenamed: () => void;
	}

	let { page, open = false, onClose, onRenamed }: Props = $props();

	let pageTitle = $state('');
	let error = $state('');
	let isLoading = $state(false);

	const currentTitle = $derived(page?.metaData?.title || '');
	const currentPath = $derived(page?.metaData?.path || '');
	const isValidTitle = $derived(validatePageTitle(pageTitle));

	// Initialize page title when page changes
	$effect(() => {
		if (page && open) {
			pageTitle = page.metaData?.title || '';
			error = '';
		}
	});

	function validatePageTitle(title: string): boolean {
		if (!title.trim()) return false;

		if (title.length > 100) {
			return false;
		}

		// Don't allow same title as current
		if (page && title.trim() === currentTitle) {
			return false;
		}

		return true;
	}

	async function renamePage() {
		if (!isValidTitle || isLoading || !page) return;

		isLoading = true;
		error = '';

		try {
			await pageActions.updatePageByPath(currentPath, {
				metaData: {
					...page.metaData,
					title: pageTitle.trim()
				},
				content: page.content
			});
			onRenamed();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to rename page';
		} finally {
			isLoading = false;
		}
	}

	function handleClose() {
		if (!isLoading) {
			onClose();
		}
	}
</script>

<Dialog {open} onOpenChange={(openState) => !openState && handleClose()}>
	<DialogContent class="max-w-md">
		<DialogHeader>
			<DialogTitle class="flex items-center gap-3">
				<Edit class="h-5 w-5 text-blue-500" />
				Rename Page
			</DialogTitle>
		</DialogHeader>

		<form
			onsubmit={(e) => {
				e.preventDefault();
				renamePage();
			}}
			class="space-y-6"
		>
			<div class="space-y-4">
				<div class="space-y-3">
					<label for="page-title" class="text-primary text-sm font-medium">New Page Title</label>
					<Input
						id="page-title"
						type="text"
						bind:value={pageTitle}
						placeholder="Enter new page title"
						class={error && pageTitle ? 'border-red-500' : ''}
						required
					/>

					{#if error && pageTitle}
						<div class="flex items-center gap-2 rounded-md bg-red-50 p-2 text-sm text-red-700">
							<AlertCircle class="h-4 w-4 flex-shrink-0" />
							{error}
						</div>
					{/if}

					<div class="bg-secondary rounded-lg border p-4">
						<div class="space-y-2">
							<span class="text-secondary text-sm font-medium">Current Title:</span>
							<div class="bg-primary block w-full rounded border px-3 py-2 text-sm text-gray-600">
								{currentTitle}
							</div>
						</div>
					</div>
				</div>

				<!-- <div class="space-y-3">


					<div class="bg-secondary rounded-lg border p-4">
						<div class="space-y-2">
							<span class="text-secondary text-sm font-medium">Path:</span>
							<code class="bg-primary block w-full rounded border px-3 py-2 text-sm text-blue-600">
								{currentPath}
							</code>
						</div>
					</div>
				</div> -->
			</div>

			<DialogFooter>
				<Button type="button" variant="outline" onclick={handleClose} disabled={isLoading}>
					Cancel
				</Button>
				<Button type="submit" disabled={!isValidTitle || isLoading}>
					{#if isLoading}
						Renaming...
					{:else}
						Rename Page
					{/if}
				</Button>
			</DialogFooter>
		</form>
	</DialogContent>
</Dialog>
