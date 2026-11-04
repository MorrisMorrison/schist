<script lang="ts" module>
	// Load the GitHub settings at most once per app session from a page.
	let loadAttempted = false;
</script>

<script lang="ts">
	// On a page a paused two-way sync is waiting on: point to where to decide.
	import { onMount } from 'svelte';
	import { githubActions, githubStore } from '#lib/stores/github.svelte.ts';

	let { path }: { path: string } = $props();
	const file = $derived(path.replace(/^\/+/, '') + '.md');
	const waiting = $derived((githubStore.settings?.sync_conflicts ?? []).includes(file));

	onMount(() => {
		if (githubStore.settings || loadAttempted) return;
		loadAttempted = true;
		githubActions.loadGitHubSettings().catch(() => githubActions.clearError());
	});
</script>

{#if waiting}
	<div
		class="border-destructive/40 mb-4 rounded-lg border p-3 text-sm"
		role="status"
		data-testid="sync-conflict-banner"
	>
		This page changed both here and on GitHub, so syncing is paused.
		<a class="underline" href="/settings#github">Pick a version in Settings → GitHub</a>.
	</div>
{/if}
