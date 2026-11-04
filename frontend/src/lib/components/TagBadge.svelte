<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { Badge } from '#lib/components/ui/badge/index.ts';

	interface Props extends HTMLAttributes<HTMLSpanElement> {
		tag: string;
		class?: string;
	}

	let { tag, class: className = '', ...restProps }: Props = $props();

	// A nested tag (device/desktop) shows its parent path muted, so the last
	// part, the one that tells tags apart, stands out.
	const cut = $derived(tag.lastIndexOf('/') + 1);
	const prefix = $derived(tag.slice(0, cut));
	const name = $derived(tag.slice(cut));
</script>

<Badge variant="tag" class={className} title={`Tag: ${tag}`} {...restProps}>
	<!-- One inline wrapper: the badge's flex gap would otherwise split prefix and name. -->
	<span
		>{#if prefix}<span data-tag-prefix class="text-[var(--tag-prefix)]">{prefix}</span
			>{/if}{name}</span
	>
</Badge>
