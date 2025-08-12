<script lang="ts">
	import { documentActions } from '$lib/stores/documents';
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
	import type { Document } from '$lib/api/types';
	import { generateSlug } from '$lib/utils/path';

	interface Props {
		document?: Document;
		open?: boolean;
		onClose: () => void;
		onRenamed: (oldPath: string, newPath: string) => void;
	}

	let { document, open = false, onClose, onRenamed }: Props = $props();

	let documentTitle = $state('');
	let error = $state('');
	let isLoading = $state(false);

	const currentTitle = $derived(document?.metaData?.title || '');
	const currentPath = $derived(document?.metaData?.path || '');
	const isValidTitle = $derived(validateDocumentTitle(documentTitle));

	$effect(() => {
		if (document && open) {
			documentTitle = document.metaData?.title || '';
			error = '';
		}
	});

	function validateDocumentTitle(title: string): boolean {
		if (!title.trim()) return false;

		if (title.length > 100) {
			return false;
		}

		if (document && title.trim() === currentTitle) {
			return false;
		}

		return true;
	}

	async function renameDocument() {
		if (!isValidTitle || isLoading || !document) return;

		isLoading = true;
		error = '';

		try {
			const slug = generateSlug(documentTitle.trim());
			const pathParts = currentPath.split('/');
			pathParts[pathParts.length - 1] = slug;
			const newPath = pathParts.join('/');

			const updatedDocument = await documentActions.updateDocumentByPath(currentPath, {
				metaData: {
					...document.metaData,
					title: documentTitle.trim(),
					slug: slug,
					path: newPath
				},
				content: document.content
			});
			onRenamed(currentPath, updatedDocument.metaData?.path || newPath);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to rename document';
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
				Rename Document
			</DialogTitle>
		</DialogHeader>

		<form
			onsubmit={(e) => {
				e.preventDefault();
				renameDocument();
			}}
			class="space-y-6"
		>
			<div class="space-y-4">
				<div class="space-y-2">
					<label for="document-title" class="text-primary text-sm font-medium"
						>New Document Title</label
					>
					<Input
						id="document-title"
						type="text"
						data-testId="document-name"
						bind:value={documentTitle}
						placeholder="Enter new document title"
						class={error && documentTitle ? 'border-red-500' : ''}
						required
					/>

					{#if error && documentTitle}
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
				<Button
					type="submit"
					data-testId="rename-document-btn"
					disabled={!isValidTitle || isLoading}
				>
					{#if isLoading}
						Renaming...
					{:else}
						Rename Document
					{/if}
				</Button>
			</DialogFooter>
		</form>
	</DialogContent>
</Dialog>
