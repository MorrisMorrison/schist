<script lang="ts">
	import { onMount } from 'svelte';
	import { apiClient } from '#lib/api/client.ts';
	import type { ApiToken, ApiTokenScope } from '#lib/api/types.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import { Input } from '#lib/components/ui/input/index.ts';
	import { Label } from '#lib/components/ui/label/index.ts';
	import { Badge } from '#lib/components/ui/badge/index.ts';
	import * as Select from '#lib/components/ui/select/index.ts';
	import { Alert, AlertDescription, AlertTitle } from '#lib/components/ui/alert/index.ts';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '#lib/components/ui/card/index.ts';
	import CopyButton from '#lib/components/CopyButton.svelte';
	import LoadingRow from '#lib/components/LoadingRow.svelte';
	import { formatDate, formatRelativeDate } from '#lib/utils/date.ts';
	import { getErrorMessage } from '#lib/utils/error.ts';
	import { Bot, KeyRound, Plus, Trash2, Loader2, Info, CircleCheck } from '@lucide/svelte';

	interface Props {
		/** Tokens need users; without auth only the connection details show. */
		authEnabled: boolean;
		mcpEnabled: boolean;
	}

	let { authEnabled, mcpEnabled }: Props = $props();

	const scopeItems = [
		{ value: 'read', label: 'Read only' },
		{ value: 'read-write', label: 'Read and write' }
	];
	const expiryItems = [
		{ value: '30', label: '30 days' },
		{ value: '90', label: '90 days' },
		{ value: '365', label: '1 year' },
		{ value: '0', label: 'Never' }
	];

	let tokens = $state<ApiToken[]>([]);
	let loading = $state(false);
	let error = $state('');
	let name = $state('');
	let scope = $state<ApiTokenScope>('read');
	let expiryDays = $state(90);
	let creating = $state(false);
	let revoking = $state<string | null>(null);
	/** The token just created; shown once, until dismissed. */
	let created = $state<{ token: string; name: string } | null>(null);

	const endpoint = `${typeof window === 'undefined' ? '' : window.location.origin}/api/mcp`;
	const tokenPlaceholder = $derived(created?.token ?? 'YOUR_TOKEN');
	const claudeCodeCommand = $derived(
		authEnabled
			? `claude mcp add --transport http schist ${endpoint} --header "Authorization: Bearer ${tokenPlaceholder}"`
			: `claude mcp add --transport http schist ${endpoint}`
	);
	const jsonConfig = $derived(
		JSON.stringify(
			{
				mcpServers: {
					schist: {
						type: 'http',
						url: endpoint,
						...(authEnabled ? { headers: { Authorization: `Bearer ${tokenPlaceholder}` } } : {})
					}
				}
			},
			null,
			2
		)
	);

	async function load() {
		loading = true;
		error = '';
		try {
			tokens = await apiClient.listApiTokens();
		} catch (e) {
			error = getErrorMessage(e, 'Failed to load tokens');
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		if (authEnabled) load();
	});

	async function create(event: SubmitEvent) {
		event.preventDefault();
		if (!name.trim() || creating) return;
		creating = true;
		error = '';
		try {
			const response = await apiClient.createApiToken({
				name: name.trim(),
				scope,
				expires_in_days: expiryDays
			});
			created = { token: response.token, name: response.info.name };
			tokens = [response.info, ...tokens];
			// Back to the safe defaults, so a second token never inherits write access.
			name = '';
			scope = 'read';
			expiryDays = 90;
		} catch (e) {
			error = getErrorMessage(e, 'Failed to create token');
		} finally {
			creating = false;
		}
	}

	async function revoke(token: ApiToken) {
		if (!confirm(`Revoke "${token.name}"? Anything using it stops working immediately.`)) return;
		revoking = token.id;
		error = '';
		try {
			await apiClient.revokeApiToken(token.id);
			tokens = tokens.filter((t) => t.id !== token.id);
		} catch (e) {
			error = getErrorMessage(e, 'Failed to revoke token');
		} finally {
			revoking = null;
		}
	}
</script>

<Card data-testid="api-tokens-section">
	<CardHeader>
		<CardTitle class="flex items-center gap-3">
			<Bot class="h-6 w-6 text-(--muted-foreground)" />
			AI Assistants &amp; API Tokens
		</CardTitle>
		<CardDescription>
			Let AI assistants search, read and write your wiki over MCP, or use the API from scripts.
		</CardDescription>
	</CardHeader>

	<CardContent class="space-y-6">
		{#if error}
			<Alert variant="destructive">
				<AlertDescription>{error}</AlertDescription>
			</Alert>
		{/if}

		{#if created}
			<Alert variant="success" data-testid="api-token-created">
				<CircleCheck />
				<AlertTitle>Token "{created.name}" created</AlertTitle>
				<AlertDescription class="space-y-3">
					<p>Copy it now. You won't be able to see it again.</p>
					<div class="bg-background flex items-center gap-2 rounded-md border p-2">
						<code class="min-w-0 flex-1 font-mono text-xs break-all" data-testid="api-token-value"
							>{created.token}</code
						>
						<CopyButton text={created.token} />
					</div>
					<Button size="sm" variant="outline" onclick={() => (created = null)}>Done</Button>
				</AlertDescription>
			</Alert>
		{/if}

		{#if authEnabled}
			<section class="space-y-3">
				<h3 class="text-sm font-medium">Personal access tokens</h3>
				<form
					class="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end"
					onsubmit={create}
					data-testid="api-token-form"
				>
					<div class="space-y-1.5">
						<Label for="token-name">Name</Label>
						<Input
							id="token-name"
							placeholder="e.g. Claude on my laptop"
							bind:value={name}
							maxlength={64}
							data-testid="api-token-name"
						/>
					</div>
					<div class="space-y-1.5">
						<Label for="token-scope">Access</Label>
						<Select.Root type="single" items={scopeItems} bind:value={scope}>
							<Select.Trigger id="token-scope" class="w-40" data-testid="api-token-scope">
								<Select.Value />
							</Select.Trigger>
							<Select.Content>
								{#each scopeItems as item (item.value)}
									<Select.Item {...item} />
								{/each}
							</Select.Content>
						</Select.Root>
					</div>
					<div class="space-y-1.5">
						<Label for="token-expiry">Expires</Label>
						<Select.Root
							type="single"
							items={expiryItems}
							bind:value={() => String(expiryDays), (value) => (expiryDays = Number(value))}
						>
							<Select.Trigger id="token-expiry" class="w-32" data-testid="api-token-expiry">
								<Select.Value />
							</Select.Trigger>
							<Select.Content>
								{#each expiryItems as item (item.value)}
									<Select.Item {...item} />
								{/each}
							</Select.Content>
						</Select.Root>
					</div>
					<Button type="submit" disabled={!name.trim() || creating} data-testid="api-token-create">
						{#if creating}
							<Loader2 class="size-4 animate-spin" />
						{:else}
							<Plus class="size-4" />
						{/if}
						Create token
					</Button>
				</form>

				{#if loading && tokens.length === 0}
					<LoadingRow text="Loading tokens..." />
				{:else if tokens.length === 0}
					<p class="text-muted-foreground text-sm">No tokens yet.</p>
				{:else}
					<ul class="space-y-2" data-testid="api-token-list">
						{#each tokens as token (token.id)}
							<li
								class="flex items-center justify-between gap-3 rounded-lg border p-3"
								data-testid="api-token-row"
							>
								<div class="min-w-0 flex-1">
									<div class="flex flex-wrap items-center gap-2">
										<KeyRound class="text-primary size-4" />
										<span class="text-sm font-medium">{token.name}</span>
										<code class="text-muted-foreground font-mono text-xs">{token.prefix}…</code>
										<Badge variant={token.scope === 'read-write' ? 'default' : 'secondary'}>
											{token.scope === 'read-write' ? 'Read and write' : 'Read only'}
										</Badge>
									</div>
									<p class="text-muted-foreground mt-1 text-xs">
										Created {formatDate(token.created_at)} ·
										{token.last_used_at
											? `Last used ${formatRelativeDate(token.last_used_at)}`
											: 'Never used'} ·
										{token.expires_at ? `Expires ${formatDate(token.expires_at)}` : 'No expiry'}
									</p>
								</div>
								<Button
									size="sm"
									variant="destructive"
									disabled={revoking === token.id}
									onclick={() => revoke(token)}
									aria-label="Revoke {token.name}"
								>
									{#if revoking === token.id}
										<Loader2 class="size-3 animate-spin" />
									{:else}
										<Trash2 class="size-3" />
									{/if}
									Revoke
								</Button>
							</li>
						{/each}
					</ul>
				{/if}
				<p class="text-muted-foreground text-xs">
					Tokens can read and (with write access) change documents, folders and assets. They can't
					reach secrets, passkeys, users or settings.
				</p>
			</section>
		{/if}

		<section class="space-y-3" data-testid="mcp-connect">
			<h3 class="text-sm font-medium">Connect an AI assistant (MCP)</h3>
			{#if mcpEnabled}
				<div class="space-y-1.5">
					<Label>Endpoint</Label>
					<div class="flex items-center gap-2 rounded-md border p-2">
						<code class="min-w-0 flex-1 font-mono text-xs break-all">{endpoint}</code>
						<CopyButton text={endpoint} />
					</div>
				</div>
				<div class="space-y-1.5">
					<Label>Claude Code</Label>
					<div class="flex items-start gap-2 rounded-md border p-2">
						<code class="min-w-0 flex-1 font-mono text-xs break-all" data-testid="mcp-claude-code"
							>{claudeCodeCommand}</code
						>
						<CopyButton text={claudeCodeCommand} />
					</div>
				</div>
				<div class="space-y-1.5">
					<Label>Other MCP clients (JSON config)</Label>
					<div class="flex items-start gap-2 rounded-md border p-2">
						<pre class="min-w-0 flex-1 overflow-x-auto font-mono text-xs">{jsonConfig}</pre>
						<CopyButton text={jsonConfig} />
					</div>
				</div>
				{#if authEnabled && !created}
					<p class="text-muted-foreground text-xs">
						Replace YOUR_TOKEN with a token from above. A read-only token only gets the search and
						read tools.
					</p>
				{/if}
			{:else}
				<Alert variant="muted" role="note" data-testid="mcp-disabled">
					<Info />
					<AlertTitle>The MCP endpoint is off</AlertTitle>
					<AlertDescription>
						Start Schist with <code class="font-mono">SCHIST_MCP_ENABLED=true</code> to let AI
						assistants connect at <code class="font-mono">/api/mcp</code>.
					</AlertDescription>
				</Alert>
			{/if}
		</section>
	</CardContent>
</Card>
