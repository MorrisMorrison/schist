<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import FolderTree from './FolderTree.svelte';
	import CreateFolderModal from './CreateFolderModal.svelte';
	import type { Folder as FolderType, Page } from '$lib/api/types';
	import { folderActions } from '$lib/stores/pages';

	let showCreateFolderModal = $state(false);
	let parentPathForModal = $state('');

	const currentPath = $derived(page.url.pathname);

	function handleFolderSelect(event: { path: string; folder: FolderType }) {
		goto(`/folders${event.path}`);
	}

	function handlePageSelect(event: { page: Page }) {
		const pagePath = event.page.metaData?.path || `/${event.page.metaData?.slug}`;
		goto(`/pages${pagePath}`);
	}

	function handleCreateFolder(event: { parentPath: string }) {
		parentPathForModal = event.parentPath;
		showCreateFolderModal = true;
	}

	function handleFolderCreated() {
		showCreateFolderModal = false;
		parentPathForModal = '';
		folderActions.loadFolderTree();
	}
</script>

<aside class="bg-primary border-border flex h-full w-full flex-col overflow-hidden border-r">
	<div class="flex-1 ">
		<FolderTree
			{currentPath}
			showPages={true}
			showSearch={true}
			showActions={true}
			storageKey="sidebar-expanded-folders"
			onselect={handleFolderSelect}
			onpageselect={handlePageSelect}
			oncreate={handleCreateFolder}
		/>
	</div>
</aside>

<!-- Create Folder Modal -->
<CreateFolderModal
	open={showCreateFolderModal}
	parentPath={parentPathForModal}
	onClose={() => {
		showCreateFolderModal = false;
		parentPathForModal = '';
	}}
	onCreated={handleFolderCreated}
/>
