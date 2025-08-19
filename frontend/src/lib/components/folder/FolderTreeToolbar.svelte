<script lang="ts">
	import { FolderOpen, Folder, Plus } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';

	interface Props {
		title?: string;
		onExpandAll?: () => void;
		onCollapseAll?: () => void;
		onCreateDocument?: () => void;
		showExpandCollapse?: boolean;
		showCreateDocument?: boolean;
	}

	let {
		title = 'Pages',
		onExpandAll,
		onCollapseAll,
		onCreateDocument,
		showExpandCollapse = true,
		showCreateDocument = true
	}: Props = $props();
</script>

<div class="border-border flex items-center justify-between border-b p-4">
	<h2 class="text-primary text-lg font-semibold">{title}</h2>
	<div class="flex items-center gap-1">
		{#if showExpandCollapse && onExpandAll}
			<Button
				variant="ghost"
				size="icon"
				class="h-6 w-6"
				onclick={onExpandAll}
				title="Expand all folders"
			>
				<FolderOpen class="h-4 w-4" />
			</Button>
		{/if}

		{#if showExpandCollapse && onCollapseAll}
			<Button
				variant="ghost"
				size="icon"
				class="h-6 w-6"
				onclick={onCollapseAll}
				title="Collapse all folders"
			>
				<Folder class="h-4 w-4" />
			</Button>
		{/if}

		{#if showCreateDocument && onCreateDocument}
			<Button
				variant="ghost"
				size="icon"
				class="h-6 w-6"
				onclick={onCreateDocument}
				title="Create new document"
			>
				<Plus class="h-4 w-4" />
			</Button>
		{/if}
	</div>
</div>
