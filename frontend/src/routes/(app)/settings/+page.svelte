<script lang="ts">
	import { PageContainer } from '#lib/components/ui/page-container/index.ts';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '#lib/components/ui/card/index.ts';
	import { Github, FileEdit } from '@lucide/svelte';
	import EditorSettingsSection from '#lib/components/EditorSettingsSection.svelte';
	import GitHubSettingsSection from '#lib/components/GitHubSettingsSection.svelte';
	import SecretManager from '#lib/components/SecretManager.svelte';
	import PasskeyManager from '#lib/components/PasskeyManager.svelte';
	import UserManagement from '#lib/components/UserManagement.svelte';
	import ApiTokensSection from '#lib/components/ApiTokensSection.svelte';
	import { authService } from '#lib/auth/auth-service.ts';
	import { apiClient } from '#lib/api/client.ts';
	import { onMount } from 'svelte';

	// Passkeys, secrets and user management are only meaningful when authentication is
	// enabled (no auth => no user, no passkeys). Hide these sections otherwise so a no-auth
	// instance doesn't surface "Authentication required" errors from user-scoped endpoints.
	// Fail-safe: isAuthEnabled() returns true when config couldn't be loaded, so we never
	// wrongly hide them in a normal auth-enabled instance.
	const authEnabled = authService.isAuthEnabled();

	let mcpEnabled = $state(false);
	onMount(() => {
		apiClient
			.getConfig()
			.then((config) => (mcpEnabled = config.mcp_enabled ?? false))
			.catch(() => {});
	});
</script>

<svelte:head>
	<title>Settings - Schist</title>
	<meta name="description" content="Configure your Schist application settings" />
</svelte:head>

<PageContainer>
	<div class="space-y-2">
		<h1 class="text-foreground text-3xl font-bold tracking-tight">Settings</h1>
		<p class="text-muted-foreground">Manage your application settings and integrations.</p>
	</div>

	<!-- Editor Settings Section -->
	<Card>
		<CardHeader>
			<CardTitle class="flex items-center gap-3" data-testid="editor-settings-title">
				<FileEdit class="h-6 w-6 text-(--muted-foreground)" />
				Editor Settings
			</CardTitle>
			<CardDescription>
				Configure your markdown editor preferences and default behavior.
			</CardDescription>
		</CardHeader>
		<CardContent>
			<EditorSettingsSection />
		</CardContent>
	</Card>

	{#if authEnabled}
		<!-- User Management Section -->
		<UserManagement />

		<!-- Passkey Security Section -->
		<PasskeyManager />

		<!-- Secret Management Section -->
		<SecretManager />
	{/if}

	<!-- AI assistants (MCP) and personal access tokens -->
	<ApiTokensSection {authEnabled} {mcpEnabled} />

	<!-- GitHub Integration Section -->
	<Card>
		<CardHeader>
			<CardTitle class="flex items-center gap-3">
				<Github class="h-6 w-6 text-(--muted-foreground)" />
				GitHub Integration
			</CardTitle>
			<CardDescription>
				Connect your documents to GitHub for backup and version control.
			</CardDescription>
		</CardHeader>
		<CardContent>
			<GitHubSettingsSection />
		</CardContent>
	</Card>

	<!-- Future Settings Sections -->
	<!-- <Card>
		<CardHeader>
			<CardTitle class="flex items-center gap-3">
				<Settings class="h-6 w-6 text-(--muted-foreground)" />
				General Settings
			</CardTitle>
			<CardDescription>General application preferences and configurations.</CardDescription>
		</CardHeader>
		<CardContent>
			<div class="py-8 text-center text-(--muted-foreground)">
				<p>More settings coming soon...</p>
			</div>
		</CardContent>
	</Card> -->
</PageContainer>
