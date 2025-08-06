<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
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
	import { LogIn, Eye, EyeOff, AlertCircle } from 'lucide-svelte';
	import { authService } from '$lib/auth/auth-service';

	let username = '';
	let password = '';
	let isLoading = false;
	let showPassword = false;
	let error = '';

	$: returnUrl = $page.url.searchParams.get('returnUrl') || '/';

	async function handleLogin() {
		if (!username || !password) {
			error = 'Please enter both username and password';
			return;
		}

		isLoading = true;
		error = '';

		try {
			await authService.login(username, password);
			await goto(returnUrl);
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : 'Login failed';
			error = errorMessage.includes('Invalid username or password')
				? 'Invalid username or password'
				: 'Login failed. Please try again.';
		} finally {
			isLoading = false;
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			handleLogin();
		}
	}

	function togglePasswordVisibility() {
		showPassword = !showPassword;
	}
</script>

<svelte:head>
	<title>Login - Schist Wiki</title>
	<meta name="description" content="Login to Schist Wiki" />
</svelte:head>

<div class="login-page bg-background flex min-h-screen items-center justify-center p-4">
	<Card class="w-full max-w-md shadow-lg">
		<CardHeader class="space-y-4 pb-8 text-center">
			<div class="mx-auto flex h-16 w-16 items-center justify-center">
				<img src="/icon-128x128.png" alt="Schist Logo" class="h-16 w-16" />
			</div>
			<div class="space-y-2">
				<CardTitle class="text-2xl font-bold">Welcome to Schist</CardTitle>
				<CardDescription class="text-muted-foreground">
					Sign in to access your documentation workspace
				</CardDescription>
			</div>
		</CardHeader>

		<CardContent class="space-y-6">
			{#if error}
				<div
					class="border-destructive/20 bg-destructive/10 text-destructive flex items-center gap-2 rounded-md border p-3 text-sm"
				>
					<AlertCircle class="h-4 w-4" />
					{error}
				</div>
			{/if}

			<form class="space-y-4" on:submit|preventDefault={handleLogin}>
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
					/>
				</div>

				<div class="space-y-2">
					<Label for="password">Password</Label>
					<div class="relative">
						<Input
							id="password"
							type={showPassword ? 'text' : 'password'}
							placeholder="Enter your password"
							bind:value={password}
							disabled={isLoading}
							autocomplete="current-password"
							required
							onkeydown={handleKeydown}
							class="pr-10"
						/>
						<button
							type="button"
							class="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2"
							on:click={togglePasswordVisibility}
							disabled={isLoading}
						>
							{#if showPassword}
								<EyeOff class="h-4 w-4" />
							{:else}
								<Eye class="h-4 w-4" />
							{/if}
						</button>
					</div>
				</div>

				<Button
					type="submit"
					variant="default"
					size="lg"
					class="h-12 w-full text-base font-medium"
					disabled={isLoading || !username || !password}
				>
					{#if isLoading}
						<div
							class="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
						></div>
						Signing in...
					{:else}
						<LogIn class="mr-2 h-5 w-5" />
						Sign In
					{/if}
				</Button>
			</form>
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
