<script lang="ts">
	// A paused two-way sync: pages changed in both Schist and GitHub. Pick a
	// side for each, then resume. The other version stays in git history.
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
	const ready = $derived(conflicts.length > 0 && conflicts.every((p) => choices[p]));

	function chooseAll(side: Side) {
		choices = Object.fromEntries(conflicts.map((p) => [p, side]));
	}

	let requested = '';
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
		try {
			await githubActions.syncToGitHub({
				resolutions: { ...choices },
				remoteHead: githubStore.settings?.paused_remote_head
			});
			choices = {};
			open = null;
		} catch (err) {
			if (parseError(err).code === 'SYNC_CONFLICT') {
				// GitHub changed a page meanwhile: the sync paused again, and the
				// refreshed list below already shows it; the old picks are void.
				choices = {};
				open = null;
			} else {
				// Keep the picks so the user can just try again.
				error = getErrorMessage(err, 'Sync failed');
			}
		} finally {
			busy = false;
		}
	}
</script>

{#if conflicts.length}
	<section
		class="border-destructive/40 space-y-3 rounded-lg border p-4"
		data-testid="sync-conflicts"
	>
		<h3 class="font-medium">
			Sync paused: {conflicts.length}
			{conflicts.length === 1 ? 'page' : 'pages'} changed in both Schist and GitHub
		</h3>
		<div class="flex gap-2">
			<Button size="sm" variant="outline" onclick={() => chooseAll('local')}>All Schist</Button>
			<Button size="sm" variant="outline" onclick={() => chooseAll('remote')}>All GitHub</Button>
		</div>
		<ul class="space-y-2">
			{#each conflicts as path (path)}
				<li class="rounded border p-2" data-testid="sync-conflict-row">
					<div class="flex flex-wrap items-center gap-2">
						<button class="font-mono text-sm underline" onclick={() => toggleDiff(path)}
							>{path}</button
						>
						<span class="flex-1"></span>
						<Button
							size="sm"
							variant={choices[path] === 'local' ? 'default' : 'outline'}
							aria-pressed={choices[path] === 'local'}
							onclick={() => (choices = { ...choices, [path]: 'local' })}>Keep Schist's</Button
						>
						<Button
							size="sm"
							variant={choices[path] === 'remote' ? 'default' : 'outline'}
							aria-pressed={choices[path] === 'remote'}
							onclick={() => (choices = { ...choices, [path]: 'remote' })}>Take GitHub's</Button
						>
					</div>
					{#if open?.path === path}
						<div class="mt-2" data-testid="sync-conflict-diff">
							<DiffViewer diffResult={open.diff} />
						</div>
					{/if}
				</li>
			{/each}
		</ul>
		{#if error}<p class="text-destructive text-sm" role="alert">{error}</p>{/if}
		<Button onclick={resume} disabled={!ready || busy}>Resume sync</Button>
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
