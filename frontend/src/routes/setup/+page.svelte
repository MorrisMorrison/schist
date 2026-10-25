<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Fingerprint, CheckCircle } from '@lucide/svelte';
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import { apiClient } from '$lib/api/client';
	import { registerPasskey } from '$lib/utils/webauthn';
	import { getErrorMessage } from '$lib/utils/error';

	let username = $state('');
	let isLoading = $state(false);
	let error = $state('');
	let currentStep = $state(1);
	let inviteToken = $state('');
	let isInviteFlow = $state(false);

	onMount(async () => {
		// Check if there's an invite token in the URL
		const urlParams = new URLSearchParams(window.location.search);
		const token = urlParams.get('invite');

		if (token) {
			// This is an invite flow
			inviteToken = token;
			isInviteFlow = true;
			// Don't check setup status for invite flow
			return;
		}

		// Regular setup flow - check if setup is required
		try {
			const response = await apiClient.checkSetupRequired();
			if (!response.requires_setup) {
				// Setup not required, redirect to login
				await goto('/login');
			}
			// If setup IS required, stay on this page
		} catch (err) {
			console.error('Failed to check setup status:', err);
			error = 'Failed to check setup status';
		}
	});

	async function handleSetup() {
		if (!username.trim()) {
			error = 'Username is required';
			return;
		}

		isLoading = true;
		error = '';

		try {
			currentStep = 2;

			// Register passkey
			const credentialId = await registerPasskey(username);

			if (isInviteFlow) {
				// Create user from invite
				await apiClient.createUserFromInvite({
					token: inviteToken,
					username: username.trim(),
					credential_id: credentialId
				});
			} else {
				// Create first user
				await apiClient.createFirstUser({
					username: username.trim(),
					credential_id: credentialId
				});
			}

			currentStep = 3;
		} catch (err) {
			console.error('Setup failed:', err);
			error = getErrorMessage(err, 'Setup failed. Please try again.');
			currentStep = 1;
		} finally {
			isLoading = false;
		}
	}

	async function goToLogin() {
		await goto('/login');
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !isLoading) {
			handleSetup();
		}
	}
</script>

<svelte:head>
	<title>Setup - Schist Wiki</title>
	<meta name="description" content="Set up your Schist Wiki with passkey authentication" />
</svelte:head>

<div class="setup-page bg-background flex min-h-screen items-center justify-center p-4">
	<Card class="w-full max-w-md shadow-lg">
		<CardHeader class="space-y-4 pb-8 text-center">
			<div class="mx-auto flex h-16 w-16 items-center justify-center">
				<img src="/icon-128x128.png" alt="Schist Logo" class="h-16 w-16" />
			</div>
			<div class="space-y-2">
				<CardTitle class="text-2xl font-bold">
					{isInviteFlow ? 'Join Schist Wiki' : 'Welcome to Schist'}
				</CardTitle>
				<CardDescription class="text-muted-foreground">
					{isInviteFlow
						? 'Complete your account setup with passkey authentication'
						: "Let's set up your passkey-native personal wiki"}
				</CardDescription>
			</div>
		</CardHeader>

		<CardContent class="space-y-6">
			{#if error}
				<ErrorAlert {error} />
			{/if}

			{#if currentStep === 1}
				<!-- Step 1: Username Input -->
				<div class="space-y-4">
					<div class="text-center">
						<h3 class="text-lg font-semibold">
							{isInviteFlow ? 'Create Your Account' : 'Create Admin Account'}
						</h3>
						<p class="text-muted-foreground text-sm">
							{isInviteFlow
								? 'Choose a username and set up your passkey'
								: 'This will be your administrator account with full access'}
						</p>
					</div>

					<div class="space-y-2">
						<Label for="username">Username</Label>
						<Input
							id="username"
							type="text"
							placeholder="Enter your username"
							bind:value={username}
							disabled={isLoading}
							autocomplete="username"
							required
							onkeydown={handleKeydown}
							class="text-center"
						/>
					</div>

					<Button
						type="button"
						variant="default"
						size="lg"
						class="h-12 w-full text-base font-medium"
						disabled={isLoading || !username.trim()}
						onclick={handleSetup}
					>
						<Fingerprint class="mr-2 h-5 w-5" />
						Create Account with Passkey
					</Button>
				</div>
			{:else if currentStep === 2}
				<!-- Step 2: Passkey Registration -->
				<div class="space-y-4 text-center">
					<div
						class="bg-primary/10 mx-auto flex h-16 w-16 items-center justify-center rounded-full"
					>
						<Fingerprint class="text-primary h-8 w-8 animate-pulse" />
					</div>
					<div>
						<h3 class="text-lg font-semibold">Setting up your passkey...</h3>
						<p class="text-muted-foreground text-sm">
							Please follow your browser's prompts to create your passkey
						</p>
					</div>
				</div>
			{:else if currentStep === 3}
				<!-- Step 3: Setup Complete -->
				<div class="space-y-4 text-center">
					<div
						class="bg-accent text-accent-foreground mx-auto flex h-16 w-16 items-center justify-center rounded-full"
					>
						<CheckCircle class="text-primary h-8 w-8" />
					</div>
					<div>
						<h3 class="text-primary text-lg font-semibold">Setup Complete!</h3>
						<p class="text-muted-foreground text-sm">
							Your passkey-native wiki is ready. You can now sign in securely.
						</p>
					</div>

					<Button
						type="button"
						variant="default"
						size="lg"
						class="h-12 w-full text-base font-medium"
						onclick={goToLogin}
					>
						Continue to Sign In
					</Button>
				</div>
			{/if}
		</CardContent>
	</Card>
</div>

<style>
	.setup-page {
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
