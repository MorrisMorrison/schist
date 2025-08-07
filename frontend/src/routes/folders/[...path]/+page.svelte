<script lang="ts">
	import FolderView from '$lib/components/folder/FolderView.svelte';
	import DocumentView from '$lib/components/document/DocumentView.svelte';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
</script>

<svelte:head>
	<title
		>{data.isFolder
			? `${data.folderName} - Folder`
			: `${data.document?.metaData?.title || 'Document'}`} - Documentation</title
	>
</svelte:head>

{#if data.isFolder}
	<FolderView
		path={data.path}
		showCreateButtons={true}
		initialDocuments={data.documents || []}
		initialFolders={data.folders || []}
	/>
{:else if data.document}
	<DocumentView document={data.document} />
{:else}
	<div class="error-state">
		<h1>Not Found</h1>
		<p>The requested folder or document could not be found.</p>
		<a href="/folders">← Back to All Folders</a>
	</div>
{/if}

<style>
	.error-state {
		text-align: center;
		padding: 2rem;
		color: var(--color-text-secondary);
	}

	.error-state h1 {
		color: var(--color-text);
		margin-bottom: 1rem;
	}

	.error-state a {
		color: var(--color-primary);
		text-decoration: none;
	}

	.error-state a:hover {
		text-decoration: underline;
	}
</style>
