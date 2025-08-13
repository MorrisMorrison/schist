<script lang="ts">
	import { Info } from 'lucide-svelte';

	export let showTaskExample: boolean = false;
</script>

<div class="bg-accent/20 rounded-lg p-4">
	<div class="flex">
		<div class="flex-shrink-0">
			<Info class="text-primary h-5 w-5" />
		</div>
		<div class="ml-3">
			<h3 class="text-primary text-sm font-medium">Markdown Tips</h3>
			<div class="text-muted-foreground mt-2 text-sm">
				<ul class="list-inside list-disc space-y-1">
					<li><strong># Heading</strong> for main headings</li>
					<li><strong>**bold**</strong> for bold text</li>
					<li><strong>*italic*</strong> for italic text</li>
					<li><strong>[link](url)</strong> for links</li>
					<li><strong>```code```</strong> for code blocks</li>
					{#if showTaskExample}
						<li><strong>- [ ] Task</strong> for checkboxes</li>
					{/if}
				</ul>
			</div>
		</div>
	</div>
</div>
