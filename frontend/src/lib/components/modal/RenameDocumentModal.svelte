<script lang="ts">
	import { documentActions } from '#lib/stores/documents.svelte.ts';
	import FormDialog from './FormDialog.svelte';
	import { Input } from '#lib/components/ui/input/index.ts';
	import { Label } from '#lib/components/ui/label/index.ts';
	import { Edit } from '@lucide/svelte';
	import InlineError from '#lib/components/ui/InlineError.svelte';
	import type { Document } from '#lib/api/types.ts';
	import { generateSlug } from '#lib/utils/path.ts';
	import { getErrorMessage } from '#lib/utils/error.ts';

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

			if (newPath !== currentPath) {
				const exists = await documentActions.checkDocumentExists(newPath);
				if (exists) {
					error = `A document already exists at "${newPath}". Please choose a different title.`;
					return;
				}
			}

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
			error = getErrorMessage(err, 'Failed to rename document');
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

<FormDialog
	{open}
	title="Rename Document"
	icon={Edit}
	submitLabel="Rename Document"
	busyLabel="Renaming..."
	busy={isLoading}
	canSubmit={isValidTitle}
	onSubmit={renameDocument}
	onClose={handleClose}
	submitTestId="rename-document-btn"
>
	<div class="space-y-2">
		<Label for="document-title" class="text-primary">New Document Title</Label>
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
			<InlineError message={error} />
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
</FormDialog>
