<script lang="ts">
	import { Download, Edit, Trash2 } from 'lucide-svelte';
	import type { Document } from '$lib/api/types.js';

	interface Props {
		document: Document | null;
		position: { x: number; y: number };
		isOpen: boolean;
		onClose: () => void;
		onRename: (document: Document) => void;
		onDelete: (document: Document) => void;
		onExport?: (document: Document) => void;
	}

	let { document, position, isOpen, onClose, onRename, onDelete, onExport }: Props = $props();

	function handleRename() {
		if (document) {
			onRename(document);
		}
		onClose();
	}

	function handleDelete() {
		if (document) {
			onDelete(document);
		}
		onClose();
	}

	function handleExport() {
		if (document && onExport) {
			onExport(document);
		}
		onClose();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			onClose();
		}
	}
</script>

{#if isOpen && document}
	<div
		class="bg-primary border-primary fixed z-50 min-w-[140px] rounded-lg border py-1 shadow-lg"
		style="left: {position.x}px; top: {position.y}px"
		onclick={(e) => e.stopPropagation()}
		onkeydown={handleKeydown}
		role="menu"
		aria-label="Document actions"
		tabindex="-1"
	>
		{#if onExport}
			<button
				type="button"
				class="hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
				onclick={handleExport}
			>
				<Download class="h-4 w-4" />
				Export
			</button>
		{/if}

		<button
			type="button"
			class="hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
			onclick={handleRename}
		>
			<Edit class="h-4 w-4" />
			Rename
		</button>

		<button
			type="button"
			class="text-destructive hover:bg-destructive/10 flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors"
			onclick={handleDelete}
		>
			<Trash2 class="h-4 w-4" />
			Delete
		</button>
	</div>
{/if}
