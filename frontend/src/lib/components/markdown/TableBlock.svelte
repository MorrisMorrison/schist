<script lang="ts">
	import type { TableBlock } from '$lib/utils/markdown-blocks';

	let { block }: { block: TableBlock } = $props();

	function getAlignment(align: 'left' | 'right' | 'center' | null): string {
		switch (align) {
			case 'left':
				return 'text-left';
			case 'right':
				return 'text-right';
			case 'center':
				return 'text-center';
			default:
				return 'text-left';
		}
	}
</script>

<table class="mb-4 w-full border-collapse">
	<thead>
		<tr>
			{#each block.header as cell, index (index)}
				<th
					class="border-b border-gray-200 bg-gray-50 p-3 text-left font-semibold dark:border-gray-700 dark:bg-gray-800 {getAlignment(
						block.align[index]
					)}"
				>
					{@html cell}
				</th>
			{/each}
		</tr>
	</thead>
	<tbody>
		{#each block.rows as row, rowIndex (rowIndex)}
			<tr>
				{#each row as cell, index (index)}
					<td
						class="border-b border-gray-200 p-3 dark:border-gray-700 {getAlignment(
							block.align[index]
						)}"
					>
						{@html cell}
					</td>
				{/each}
			</tr>
		{/each}
	</tbody>
</table>
