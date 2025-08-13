<script lang="ts">
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import { Github } from 'lucide-svelte';
	import GitHubSettingsSection from '$lib/components/GitHubSettingsSection.svelte';
	import GitHubDocsManager from '$lib/components/GitHubDocsManager.svelte';
	import SecretManager from '$lib/components/SecretManager.svelte';
	import PasskeyManager from '$lib/components/PasskeyManager.svelte';
	import UserManagement from '$lib/components/UserManagement.svelte';
	import { isGitHubConnected } from '$lib/stores/github';
</script>

<svelte:head>
	<title>Settings - Schist</title>
	<meta name="description" content="Configure your Schist application settings" />
</svelte:head>

<div class="container mx-auto max-w-4xl space-y-8 px-4 py-8">
	<div class="space-y-2">
		<h1 class="text-foreground text-3xl font-bold tracking-tight">Settings</h1>
		<p class="text-muted-foreground">Manage your application settings and integrations.</p>
	</div>

	<!-- User Management Section -->
	<UserManagement />

	<!-- Passkey Security Section -->
	<PasskeyManager />

	<!-- Secret Management Section -->
	<SecretManager />

	<!-- GitHub Integration Section -->
	<Card>
		<CardHeader>
			<CardTitle class="flex items-center gap-3">
				<Github class="h-6 w-6 text-[--muted-foreground]" />
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

	<!-- GitHub Documentation Repositories - Only show when GitHub is connected -->
	{#if $isGitHubConnected}
		<GitHubDocsManager />
	{/if}

	<!-- Future Settings Sections -->
	<!-- <Card>
		<CardHeader>
			<CardTitle class="flex items-center gap-3">
				<Settings class="h-6 w-6 text-[--muted-foreground]" />
				General Settings
			</CardTitle>
			<CardDescription>General application preferences and configurations.</CardDescription>
		</CardHeader>
		<CardContent>
			<div class="py-8 text-center text-[--muted-foreground]">
				<p>More settings coming soon...</p>
			</div>
		</CardContent>
	</Card> -->
</div>
