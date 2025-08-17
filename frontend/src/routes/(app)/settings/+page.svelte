<script lang="ts">
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import { Github, FileEdit } from 'lucide-svelte';
	import EditorSettingsSection from '$lib/components/EditorSettingsSection.svelte';
	import GitHubSettingsSection from '$lib/components/GitHubSettingsSection.svelte';
	import SecretManager from '$lib/components/SecretManager.svelte';
	import PasskeyManager from '$lib/components/PasskeyManager.svelte';
	import UserManagement from '$lib/components/UserManagement.svelte';
</script>

<svelte:head>
	<title>Settings - Schist</title>
	<meta name="description" content="Configure your Schist application settings" />
</svelte:head>

<div class="mx-auto max-w-5xl space-y-8 p-6">
	<div class="space-y-2">
		<h1 class="text-foreground text-3xl font-bold tracking-tight">Settings</h1>
		<p class="text-muted-foreground">Manage your application settings and integrations.</p>
	</div>

	<!-- Editor Settings Section -->
	<Card>
		<CardHeader>
			<CardTitle class="flex items-center gap-3" data-testid="editor-settings-title">
				<FileEdit class="h-6 w-6 text-[--muted-foreground]" />
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
