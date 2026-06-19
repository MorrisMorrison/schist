<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import { Fingerprint, AlertCircle } from '@lucide/svelte';
	import { apiClient } from '$lib/api/client';
	import { authenticateWithPasskey } from '$lib/utils/webauthn';
	import { authService } from '$lib/auth/auth-service';
	import { getErrorMessage } from '$lib/utils/error';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';

	let isLoading = $state(false);
	let error = $state('');
	let checkingSetup = $state(true);

	const returnUrl = $derived(page.url.searchParams.get('returnUrl') || '/');

	onMount(async () => {
		// Check if setup is required first
		try {
			const response = await apiClient.checkSetupRequired();
			if (response.requires_setup) {
				// Setup required, redirect to setup page
				await goto('/setup');
				return;
			}
		} catch (err) {
			console.error('Failed to check setup status:', err);
		}
		checkingSetup = false;
	});

	async function handlePasskeyLogin() {
		isLoading = true;
		error = '';

		try {
			// Authenticate with passkey
			const credentialId = await authenticateWithPasskey();

			// Login with the credential ID
			await authService.loginWithPasskey(credentialId);

			// Navigate to return URL
			await goto(returnUrl);
		} catch (err) {
			console.error('Passkey login failed:', err);
			error = getErrorMessage(err, 'Passkey authentication failed. Please try again.');
		} finally {
			isLoading = false;
		}
	}
</script>

<svelte:head>
	<title>Sign In - Schist Wiki</title>
	<meta name="description" content="Sign in to Schist Wiki with your passkey" />
</svelte:head>

<div class="login-page bg-background flex min-h-screen items-center justify-center p-4">
	<Card class="w-full max-w-md shadow-lg">
		<CardHeader class="space-y-4 pb-8 text-center">
			<div class="mx-auto flex h-16 w-16 items-center justify-center">
				<img src="/icon-128x128.png" alt="Schist Logo" class="h-16 w-16" data-testid="login-logo" />
			</div>
			<div class="space-y-2">
				<CardTitle class="text-2xl font-bold" data-testid="login-title">Welcome Back</CardTitle>
				<CardDescription class="text-muted-foreground">
					Sign in securely with your passkey
				</CardDescription>
			</div>
		</CardHeader>

		<CardContent class="space-y-6">
			{#if error}
				<div
					class="border-destructive/20 bg-destructive/10 text-destructive flex items-center gap-2 rounded-md border p-3 text-sm"
					data-testid="login-error"
				>
					<AlertCircle class="h-4 w-4" />
					{error}
				</div>
			{/if}

			{#if checkingSetup}
				<div class="space-y-4 text-center">
					<div class="mx-auto flex h-12 w-12 items-center justify-center">
						<LoadingSpinner size="md" />
					</div>
					<p class="text-muted-foreground text-sm">Checking system status...</p>
				</div>
			{:else}
				<div class="space-y-6">
					<div class="space-y-2 text-center">
						<div
							class="bg-primary/10 mx-auto flex h-16 w-16 items-center justify-center rounded-full"
						>
							<Fingerprint class="text-primary h-8 w-8" />
						</div>
						<h3 class="text-lg font-semibold">Passkey Authentication</h3>
						<p class="text-muted-foreground text-sm">
							Use your device's built-in security to sign in
						</p>
					</div>

					<Button
						type="button"
						variant="default"
						size="lg"
						class="h-12 w-full text-base font-medium"
						disabled={isLoading}
						onclick={handlePasskeyLogin}
						data-testid="passkey-login-button"
					>
						{#if isLoading}
							<LoadingSpinner size="sm" class="mr-2" />
							Authenticating...
						{:else}
							<Fingerprint class="mr-2 h-5 w-5" />
							Sign In with Passkey
						{/if}
					</Button>

					<div class="text-center">
						<p class="text-muted-foreground text-xs">Secure • Passwordless • Privacy-First</p>
					</div>
				</div>
			{/if}
		</CardContent>
	</Card>
</div>

<style>
	.login-page {
		position: fixed;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		z-index: 9999;
		margin: 0;
		padding: 1rem;
		box-sizing: border-box;
	}
</style>
