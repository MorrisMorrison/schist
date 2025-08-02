<script lang="ts">
	import '../../app.css';
	import { Button } from '$lib/components/ui/button';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import { LogIn } from 'lucide-svelte';

	// Import theme store to initialize theme
	import '$lib/stores/theme.js';

	// Placeholder function for OAuth authentication
	function handleLogin() {
		// TODO: Implement OAuth login
		console.log('Login clicked');
	}
</script>

<svelte:head>
	<title>Login - Schist Wiki</title>
	<meta name="description" content="Login to Schist Wiki" />
</svelte:head>

<div class="bg-background flex min-h-screen items-center justify-center p-4">
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
			<Button
				variant="default"
				size="lg"
				class="h-12 w-full text-base font-medium"
				onclick={handleLogin}
			>
				<LogIn class="h-5 w-5" />
				Login with OAuth Provider
			</Button>

			<div class="text-muted-foreground text-center text-sm">
				<p>
					By signing in, you agree to our
					<a href="/terms" class="hover:text-primary underline underline-offset-4"
						>Terms of Service</a
					>
					and
					<a href="/privacy" class="hover:text-primary underline underline-offset-4"
						>Privacy Policy</a
					>
				</p>
			</div>
		</CardContent>
	</Card>
</div>

