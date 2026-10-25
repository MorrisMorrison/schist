<script lang="ts">
	// Stand-in for a child component in component tests: renders a marker element
	// and records its props. Mount it through `namedStub` from `stub-component.ts`.
	import { stubProps } from './stub-registry';

	let { stubName = 'stub', ...rest }: Record<string, unknown> = $props();

	// The rest object is reactive, so reading from it later yields current values.
	// svelte-ignore state_referenced_locally
	stubProps[stubName as string] = rest;
</script>

<div data-testid="stub-{stubName}" data-open={String(rest.open ?? '')}></div>
