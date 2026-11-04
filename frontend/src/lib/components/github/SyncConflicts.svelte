<script lang="ts">
	// A paused two-way sync: pages changed in both Schist and GitHub. Pick a
	// side for each, then resume. The other version stays in git history.
	import { untrack } from 'svelte';
	import { Button } from '#lib/components/ui/button/index.ts';
	import DiffViewer from '#lib/components/DiffViewer.svelte';
	import { githubActions, githubStore } from '#lib/stores/github.svelte.ts';
	import { getErrorMessage, parseError } from '#lib/utils/error.ts';
	import type { ConflictVersions } from '#lib/api/types.ts';

	type Side = 'local' | 'remote';
	const conflicts = $derived(githubStore.settings?.sync_conflicts ?? []);
	const unreadable = $derived(githubStore.settings?.unreadable ?? []);
	let choices = $state<Record<string, Side>>({});
	let open = $state<ConflictVersions | null>(null);
	let busy = $state(false);
	let error = $state('');
	let requested = '';
	/** GitHub changed again from outside (a background sync): earlier picks were dropped. */
	let changedAgain = $state(false);
	/**
	 * The GitHub head the picks were made against; a resume sends it. The
	 * server only applies a pick while the page on GitHub is still what the
	 * user saw at this head.
	 */
	let decidedHead: string | undefined;
	/** Picks the server kept on a renewed pause: not listed as conflicts any more, but still sent. */
	const decided = $derived(Object.keys(choices).filter((p) => !conflicts.includes(p)));
	const ready = $derived(conflicts.length > 0 && conflicts.every((p) => choices[p]));

	// The pause moved to another GitHub head without the user's own resume
	// (a background sync, a refresh): the picks and the open diff were made
	// against content that is gone, so start over at the new head.
	$effect(() => {
		const head = githubStore.settings?.paused_remote_head;
		if (busy) return; // a resume sets the new head itself
		untrack(() => {
			if (head === decidedHead) return;
			const hadDecisions = decidedHead !== undefined && head !== undefined && head !== '';
			changedAgain = hadDecisions && (Object.keys(choices).length > 0 || open !== null);
			choices = {};
			open = null;
			requested = '';
			decidedHead = head;
		});
	});

	function chooseAll(side: Side) {
		choices = Object.fromEntries([...conflicts, ...decided].map((p) => [p, side]));
	}

	async function toggleDiff(path: string) {
		if (open?.path === path) {
			open = null;
			requested = '';
			return;
		}
		requested = path;
		try {
			error = '';
			const versions = await githubActions.loadConflict(path);
			// An older request resolving last must not replace the page asked for since.
			if (requested === path) open = versions;
		} catch (err) {
			if (requested === path) error = getErrorMessage(err, 'Could not load both versions');
		}
	}

	async function resume() {
		busy = true;
		error = '';
		changedAgain = false;
		try {
			await githubActions.syncToGitHub({ resolutions: { ...choices }, remoteHead: decidedHead });
			choices = {};
			open = null;
			decidedHead = undefined;
		} catch (err) {
			const { code, details } = parseError(err);
			if (code === 'SYNC_CONFLICT') {
				// Paused again (the refreshed list shows why). The server re-checked
				// every pick: those on pages listed again are void; the others still
				// hold at the new head and go out with the next resume. Without the
				// server's list, every pick is void.
				const listed = details?.conflicts;
				const again = Array.isArray(listed) ? new Set<unknown>(listed) : null;
				choices = again
					? Object.fromEntries(Object.entries(choices).filter(([p]) => !again.has(p)))
					: {};
				open = null;
				requested = '';
				decidedHead =
					typeof details?.remote_head === 'string'
						? details.remote_head
						: githubStore.settings?.paused_remote_head;
			} else {
				// Keep the picks so the user can just try again.
				error = getErrorMessage(err, 'Sync failed');
			}
		} finally {
			busy = false;
		}
	}
</script>

{#snippet sides(path: string)}
	<Button
		size="sm"
		variant={choices[path] === 'local' ? 'default' : 'outline'}
		aria-pressed={choices[path] === 'local'}
		aria-label="Keep Schist's version of {path}"
		onclick={() => (choices = { ...choices, [path]: 'local' })}>Keep Schist's</Button
	>
	<Button
		size="sm"
		variant={choices[path] === 'remote' ? 'default' : 'outline'}
		aria-pressed={choices[path] === 'remote'}
		aria-label="Take GitHub's version of {path}"
		onclick={() => (choices = { ...choices, [path]: 'remote' })}>Take GitHub's</Button
	>
{/snippet}

{#if conflicts.length}
	<section
		class="border-destructive/40 space-y-3 rounded-lg border p-4"
		data-testid="sync-conflicts"
	>
		<h3 class="font-medium">
			Sync paused: {conflicts.length}
			{conflicts.length === 1 ? 'page' : 'pages'} changed in both Schist and GitHub
		</h3>
		{#if changedAgain}
			<p class="text-sm" role="status">
				GitHub changed again since you started, so your picks were cleared. Please review the pages
				again.
			</p>
		{/if}
		<div class="flex gap-2">
			<Button size="sm" variant="outline" onclick={() => chooseAll('local')}>All Schist</Button>
			<Button size="sm" variant="outline" onclick={() => chooseAll('remote')}>All GitHub</Button>
		</div>
		<ul class="space-y-2">
			{#each conflicts as path (path)}
				<li class="rounded border p-2" data-testid="sync-conflict-row">
					<div class="flex flex-wrap items-center gap-2">
						<button
							type="button"
							class="font-mono text-sm underline"
							aria-expanded={open?.path === path}
							onclick={() => toggleDiff(path)}>{path}</button
						>
						<span class="flex-1"></span>
						{@render sides(path)}
					</div>
					{#if open?.path === path}
						<div class="mt-2" data-testid="sync-conflict-diff">
							<DiffViewer diffResult={open.diff} />
						</div>
					{/if}
				</li>
			{/each}
			{#each decided as path (path)}
				<li class="rounded border border-dashed p-2" data-testid="sync-decided-row">
					<div class="flex flex-wrap items-center gap-2">
						<span class="font-mono text-sm">{path}</span>
						<span class="text-muted-foreground text-xs">Already decided</span>
						<span class="flex-1"></span>
						{@render sides(path)}
					</div>
				</li>
			{/each}
		</ul>
		{#if error}<p class="text-destructive text-sm" role="alert">{error}</p>{/if}
		<div class="flex flex-wrap items-center gap-3">
			<Button onclick={resume} disabled={!ready || busy}>Resume sync</Button>
			{#if !ready}
				<p class="text-muted-foreground text-sm">Pick a side for every page to resume.</p>
			{/if}
		</div>
	</section>
{/if}

{#if unreadable.length}
	<section class="space-y-1 rounded-lg border p-4" data-testid="sync-unreadable">
		<h3 class="text-sm font-medium">Not readable by Schist ({unreadable.length})</h3>
		<p class="text-muted-foreground text-sm">
			These files came from GitHub and are kept as they are, but Schist can't show them as pages (no
			front matter, or a file name with spaces or other characters).
		</p>
		<ul class="font-mono text-xs">
			{#each unreadable as file (file)}<li>{file}</li>{/each}
		</ul>
	</section>
{/if}
