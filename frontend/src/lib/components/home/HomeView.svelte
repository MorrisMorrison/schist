<script lang="ts">
	import { onMount } from 'svelte';
	import { Clock, FileText, Pin, PinOff, Plus } from '@lucide/svelte';
	import { Button } from '#lib/components/ui/button/index.ts';
	import * as Tabs from '#lib/components/ui/tabs/index.ts';
	import { PageContainer } from '#lib/components/ui/page-container/index.ts';
	import { documentActions, documentsStore } from '#lib/stores/documents.svelte.ts';
	import { isPinned, pinnedDocuments, setPinned } from '#lib/utils/pins.ts';
	import { getRecentDocuments } from '#lib/utils/recent-documents.ts';
	import { formatTimeAgo } from '#lib/utils/date.ts';
	import { getParentPath } from '#lib/utils/path.ts';
	import type { DocumentSummary } from '#lib/api/types.ts';

	// How many rows each Recent tab shows.
	const RECENT_LIMIT = 10;

	type RecentTab = 'opened' | 'changed';
	let tab = $state<RecentTab>('opened');
	let pinning = $state<string | null>(null);

	onMount(() => {
		documentActions.loadDocuments().catch(console.error);
	});

	const documents = $derived(documentsStore.documents);
	const pins = $derived(pinnedDocuments(documents));

	interface Row {
		document: DocumentSummary;
		when?: string;
	}

	// Opened by you: this browser's history, matched to pages that still exist.
	const opened = $derived.by((): Row[] => {
		const byPath = new Map(documents.map((d) => [d.metaData.path, d]));
		return getRecentDocuments()
			.flatMap((entry) => {
				const document = byPath.get(entry.path);
				return document ? [{ document, when: entry.openedAt }] : [];
			})
			.slice(0, RECENT_LIMIT);
	});

	// Changed: every page by its last change, so edits from elsewhere show up
	// (another device, AI assistants over MCP, an import).
	const changed = $derived.by((): Row[] =>
		[...documents]
			.filter((d) => d.metaData.updated)
			.sort((a, b) => String(b.metaData.updated).localeCompare(String(a.metaData.updated)))
			.slice(0, RECENT_LIMIT)
			.map((document) => ({ document, when: String(document.metaData.updated) }))
	);

	const rows = $derived(tab === 'opened' ? opened : changed);

	function href(document: DocumentSummary) {
		return `/documents${document.metaData.path}`;
	}

	function folderOf(document: DocumentSummary) {
		return getParentPath(document.metaData.path).replace(/^\//, '');
	}

	async function togglePin(document: DocumentSummary) {
		const path = document.metaData.path;
		pinning = path;
		try {
			await setPinned(path, !isPinned(document));
			await documentActions.loadDocuments(true);
		} catch (error) {
			console.error('Failed to change the pin:', error);
		} finally {
			pinning = null;
		}
	}
</script>

<PageContainer>
	<div class="mb-8 flex items-center justify-between gap-4">
		<h1 class="text-3xl font-bold">Home</h1>
		<Button href="/new" size="sm" data-testid="create-document">
			<Plus class="size-4" />
			New page
		</Button>
	</div>

	<section class="mb-10" aria-labelledby="home-pinned">
		<h2 id="home-pinned" class="mb-3 flex items-center gap-2 text-lg font-semibold">
			<Pin class="text-primary size-4" />
			Pinned
		</h2>
		{#if pins.length > 0}
			<div class="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-3">
				{#each pins as document (document.metaData.path)}
					<a
						href={href(document)}
						data-testid="pinned-tile"
						class="border-border bg-card hover:border-primary/50 group block min-w-0 rounded-lg border px-4 py-3 no-underline transition-colors hover:no-underline"
					>
						<span data-tile-title class="text-foreground block truncate text-sm font-medium"
							>{document.metaData.title}</span
						>
						<span class="text-muted-foreground block truncate text-xs"
							>{folderOf(document) || 'Top level'}</span
						>
					</a>
				{/each}
			</div>
		{:else}
			<p class="text-muted-foreground text-sm">
				Pin pages from their ⋯ menu, or with the pin on a recent page. Pins are shared with everyone
				in this wiki.
			</p>
		{/if}
	</section>

	<section aria-labelledby="home-recent">
		<Tabs.Root bind:value={() => tab, (value) => (tab = value as RecentTab)}>
			<div class="mb-2 flex flex-wrap items-center justify-between gap-3">
				<h2 id="home-recent" class="flex items-center gap-2 text-lg font-semibold">
					<Clock class="text-muted-foreground size-4" />
					Recent
				</h2>
				<Tabs.List>
					<Tabs.Trigger value="opened">Opened by you</Tabs.Trigger>
					<Tabs.Trigger value="changed">Changed</Tabs.Trigger>
				</Tabs.List>
			</div>

			{#if rows.length > 0}
				<ul class="border-border border-t">
					{#each rows as row (row.document.metaData.path)}
						{@const pinned = isPinned(row.document)}
						<li
							data-testid="recent-row"
							class="border-border hover:bg-accent/50 flex items-center gap-3 border-b px-1 py-2"
						>
							<FileText class="text-muted-foreground size-4 shrink-0" />
							<a
								href={href(row.document)}
								class="text-foreground min-w-0 flex-1 truncate text-sm no-underline hover:underline"
							>
								<span data-row-title>{row.document.metaData.title}</span>
								{#if folderOf(row.document)}
									<span class="text-muted-foreground ml-2 text-xs">{folderOf(row.document)}</span>
								{/if}
							</a>
							<span class="text-muted-foreground shrink-0 text-xs">{formatTimeAgo(row.when)}</span>
							<Button
								variant="ghost"
								size="icon"
								class="size-7 shrink-0 {pinned ? 'text-primary' : 'text-muted-foreground'}"
								aria-label={`${pinned ? 'Unpin' : 'Pin'} ${row.document.metaData.title}`}
								title={pinned ? 'Unpin' : 'Pin to Home'}
								disabled={pinning === row.document.metaData.path}
								onclick={() => togglePin(row.document)}
							>
								{#if pinned}<PinOff class="size-4" />{:else}<Pin class="size-4" />{/if}
							</Button>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="text-muted-foreground border-border border-t py-4 text-sm">
					{tab === 'opened' ? 'Pages you open show up here.' : 'Nothing has changed yet.'}
				</p>
			{/if}
		</Tabs.Root>
	</section>

	<p class="text-muted-foreground border-border mt-6 border-t pt-4 text-sm">
		<span data-testid="home-page-count"
			>{documents.length} {documents.length === 1 ? 'page' : 'pages'}</span
		>
		·
		<a href="/folders">Browse all</a>
	</p>
</PageContainer>
