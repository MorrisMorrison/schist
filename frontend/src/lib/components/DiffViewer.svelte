<script lang="ts">
	import { Plus, Minus, RotateCcw } from 'lucide-svelte';
	import { Badge } from '$lib/components/ui/badge';
	import type { DiffResult, DiffLine } from '$lib/api/types';

	interface Props {
		diffResult: DiffResult;
	}

	let { diffResult }: Props = $props();

	function getLineTypeIcon(type: DiffLine['type']) {
		switch (type) {
			case 'addition':
				return Plus;
			case 'deletion':
				return Minus;
			case 'modification':
				return RotateCcw;
			default:
				return null;
		}
	}

	function getLineTypeClass(type: DiffLine['type']): string {
		switch (type) {
			case 'addition':
				return 'bg-accent/50 border-l-4 border-l-primary';
			case 'deletion':
				return 'bg-destructive/10 border-l-4 border-l-destructive';
			case 'modification':
				return 'bg-muted border-l-4 border-l-muted-foreground';
			case 'context':
				return 'bg-muted/50';
			default:
				return '';
		}
	}

	function getLineTypeTextColor(type: DiffLine['type']): string {
		switch (type) {
			case 'addition':
				return 'text-green-800 dark:text-green-200';
			case 'deletion':
				return 'text-red-800 dark:text-red-200';
			case 'modification':
				return 'text-yellow-800 dark:text-yellow-200';
			case 'context':
				return 'text-gray-700 dark:text-gray-300';
			default:
				return 'text-gray-700 dark:text-gray-300';
		}
	}

	function getLineNumberColor(type: DiffLine['type']): string {
		switch (type) {
			case 'addition':
				return 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30';
			case 'deletion':
				return 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30';
			case 'modification':
				return 'text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30';
			case 'context':
				return 'text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800';
			default:
				return 'text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800';
		}
	}

	// Group consecutive context lines to show "..." for long stretches
	function groupLines(lines: DiffLine[]): (DiffLine | { type: 'separator'; count: number })[] {
		const grouped: (DiffLine | { type: 'separator'; count: number })[] = [];
		let contextBuffer: DiffLine[] = [];

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];

			if (line.type === 'context') {
				contextBuffer.push(line);
			} else {
				// If we have more than 6 context lines, show first 3, separator, last 3
				if (contextBuffer.length > 6) {
					grouped.push(...contextBuffer.slice(0, 3));
					grouped.push({ type: 'separator', count: contextBuffer.length - 6 });
					grouped.push(...contextBuffer.slice(-3));
				} else {
					grouped.push(...contextBuffer);
				}
				contextBuffer = [];
				grouped.push(line);
			}
		}

		// Handle remaining context lines
		if (contextBuffer.length > 6) {
			grouped.push(...contextBuffer.slice(0, 3));
			grouped.push({ type: 'separator', count: contextBuffer.length - 6 });
			grouped.push(...contextBuffer.slice(-3));
		} else {
			grouped.push(...contextBuffer);
		}

		return grouped;
	}

	const groupedLines = $derived(groupLines(diffResult.lines));
</script>

<div class="flex h-full flex-col">
	<!-- Summary Header -->
	<div class="bg-muted/30 flex items-center justify-between border-b p-4">
		<div class="flex items-center gap-4">
			<h3 class="font-medium">Changes</h3>
			<div class="flex items-center gap-3 text-sm">
				<div class="flex items-center gap-1">
					<Plus class="h-4 w-4 text-green-600" />
					<span class="font-medium text-green-600">{diffResult.summary.additions}</span>
					<span class="text-muted-foreground">additions</span>
				</div>
				<div class="flex items-center gap-1">
					<Minus class="h-4 w-4 text-red-600" />
					<span class="font-medium text-red-600">{diffResult.summary.deletions}</span>
					<span class="text-muted-foreground">deletions</span>
				</div>
				<div class="flex items-center gap-1">
					<RotateCcw class="h-4 w-4 text-yellow-600" />
					<span class="font-medium text-yellow-600">{diffResult.summary.modifications}</span>
					<span class="text-muted-foreground">modifications</span>
				</div>
			</div>
		</div>
		<div class="text-muted-foreground flex items-center gap-2 text-sm">
			<Badge variant="outline" class="font-mono text-xs">
				{diffResult.hash1.substring(0, 8)}
			</Badge>
			<span>vs</span>
			<Badge variant="outline" class="font-mono text-xs">
				{diffResult.hash2.substring(0, 8)}
			</Badge>
		</div>
	</div>

	<!-- Diff Content -->
	<div class="flex-1 overflow-auto">
		{#if diffResult.lines.length === 0}
			<div class="flex flex-col items-center justify-center py-12 text-center">
				<div class="text-muted-foreground mb-2">No differences found</div>
				<div class="text-muted-foreground text-sm">
					The selected versions have identical content
				</div>
			</div>
		{:else}
			<div class="font-mono text-sm">
				{#each groupedLines as item, index (index)}
					{#if 'count' in item}
						<!-- Separator for collapsed context lines -->
						<div class="border-border bg-muted border-y px-4 py-2 text-center">
							<button
								class="text-muted-foreground hover:text-foreground text-sm transition-colors"
								onclick={() => {
									// Could implement expanding context lines here
									console.log('Expand context lines');
								}}
							>
								⋯ {item.count} unchanged lines ⋯
							</button>
						</div>
					{:else}
						<!-- Regular diff line -->
						<div class="flex {getLineTypeClass(item.type)}">
							<!-- Line Numbers -->
							<div class="flex">
								<!-- Old line number -->
								<div
									class="w-12 px-2 py-1 text-right select-none {getLineNumberColor(
										item.type
									)} border-r"
								>
									{#if item.old_line !== undefined}
										<span class="text-xs">{item.old_line}</span>
									{:else}
										<span class="text-xs opacity-50">—</span>
									{/if}
								</div>
								<!-- New line number -->
								<div
									class="w-12 px-2 py-1 text-right select-none {getLineNumberColor(
										item.type
									)} border-r"
								>
									{#if item.new_line !== undefined}
										<span class="text-xs">{item.new_line}</span>
									{:else}
										<span class="text-xs opacity-50">—</span>
									{/if}
								</div>
							</div>

							<!-- Change indicator -->
							<div
								class="flex w-8 items-center justify-center px-1 py-1 {getLineTypeClass(item.type)}"
							>
								{#if item.type !== 'context'}
									{@const Icon = getLineTypeIcon(item.type)}
									{#if Icon}
										<Icon class="h-3 w-3 {getLineTypeTextColor(item.type)}" />
									{/if}
								{/if}
							</div>

							<!-- Line content -->
							<div
								class="flex-1 px-3 py-1 {getLineTypeTextColor(
									item.type
								)} break-all whitespace-pre-wrap"
							>
								{item.content || '\u00A0'}
							</div>
						</div>
					{/if}
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	/* Ensure proper line height and spacing for the diff view */
	.font-mono {
		line-height: 1.4;
	}

	/* Handle very long lines by allowing horizontal scrolling */
	.break-all {
		word-break: break-all;
		overflow-wrap: anywhere;
	}
</style>
