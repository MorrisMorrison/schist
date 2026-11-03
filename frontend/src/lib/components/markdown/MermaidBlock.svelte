<script lang="ts">
	import type { CodeBlock as CodeBlockData } from '#lib/utils/markdown-blocks.ts';
	import CopyButton from '#lib/components/CopyButton.svelte';
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.ts';
	import { themeStore } from '#lib/stores/theme.svelte.ts';
	import { renderMermaid, mermaidErrorMessage } from '#lib/utils/mermaid.ts';
	import { CircleAlert, Network, Code } from '@lucide/svelte';

	let { block }: { block: CodeBlockData } = $props();

	type View = 'diagram' | 'code';
	let view = $state<View>('diagram');
	let svg = $state('');
	let error = $state('');
	let rendering = $state(true);

	// Re-render when the diagram or the theme changes; ignore a render that
	// finishes after a newer one started.
	$effect(() => {
		const code = block.code;
		const theme = themeStore.current;
		let stale = false;
		rendering = true;

		renderMermaid(code, theme)
			.then((result) => {
				if (stale) return;
				svg = result.svg;
				error = '';
			})
			.catch((err) => {
				if (stale) return;
				svg = '';
				error = mermaidErrorMessage(err);
			})
			.finally(() => {
				if (!stale) rendering = false;
			});

		return () => {
			stale = true;
		};
	});

	const showCode = $derived(view === 'code' || Boolean(error));
</script>

<div
	class="code-block-container group bg-muted/30 relative my-4 rounded-lg border"
	data-testid="mermaid-block"
>
	<div class="bg-muted/50 flex items-center justify-between gap-2 border-b px-4 py-2">
		<span class="code-lang text-muted-foreground bg-muted rounded px-2 py-1 text-xs">mermaid</span>
		<div class="flex items-center gap-2">
			{#if !error}
				<ToggleGroup.Root
					type="single"
					variant="segmented"
					size="sm"
					aria-label="Show diagram or code"
					bind:value={() => view, (value: string) => value && (view = value as View)}
				>
					<ToggleGroup.Item value="diagram" title="Show the diagram">
						<Network class="size-3.5" />
						Diagram
					</ToggleGroup.Item>
					<ToggleGroup.Item value="code" title="Show the Mermaid code">
						<Code class="size-3.5" />
						Code
					</ToggleGroup.Item>
				</ToggleGroup.Root>
			{/if}
			<CopyButton
				text={block.code}
				size="sm"
				variant="ghost"
				class="text-muted-foreground hover:text-foreground"
			/>
		</div>
	</div>

	{#if error}
		<div
			class="text-destructive flex items-start gap-2 border-b px-4 py-2 text-sm"
			role="alert"
			data-testid="mermaid-error"
		>
			<CircleAlert class="mt-0.5 size-4 shrink-0" />
			<span class="whitespace-pre-wrap">The diagram has an error: {error}</span>
		</div>
	{/if}

	{#if showCode}
		<pre class="overflow-x-auto p-4 text-sm leading-relaxed"><code class="hljs language-mermaid"
				>{@html block.highlighted}</code
			></pre>
	{:else if rendering && !svg}
		<div class="text-muted-foreground p-6 text-center text-sm" aria-live="polite">
			Drawing diagram…
		</div>
	{:else}
		<!-- Mermaid's strict security level sanitizes the SVG (no scripts or handlers). -->
		<div
			class="mermaid-diagram flex justify-center overflow-x-auto p-4"
			data-testid="mermaid-diagram"
		>
			{@html svg}
		</div>
	{/if}
</div>

<style>
	/* Mermaid sets a fixed max-width on the SVG; let it shrink with the column. */
	.mermaid-diagram :global(svg) {
		max-width: 100%;
		height: auto;
	}
</style>
