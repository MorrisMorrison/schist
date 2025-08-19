<script lang="ts">
	import { Alert, AlertDescription } from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { X, AlertCircle, AlertTriangle, Info } from '@lucide/svelte';

	export interface Props {
		error: string;
		variant?: 'error' | 'warning' | 'info';
		onDismiss?: () => void;
		class?: string;
	}

	let { error, variant = 'error', onDismiss, class: className }: Props = $props();

	const variantClasses = {
		error:
			'border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive',
		warning:
			'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200 [&>svg]:text-amber-600 dark:[&>svg]:text-amber-400',
		info: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-200 [&>svg]:text-blue-600 dark:[&>svg]:text-blue-400'
	};

	const icons = {
		error: AlertCircle,
		warning: AlertTriangle,
		info: Info
	};

	const IconComponent = icons[variant];
</script>

<Alert class="{variantClasses[variant]} {className}">
	<IconComponent class="h-4 w-4" />
	<AlertDescription class="flex items-center justify-between">
		<span>{error}</span>
		{#if onDismiss}
			<Button variant="ghost" size="sm" onclick={onDismiss} class="h-auto p-0 hover:bg-transparent">
				<X class="h-4 w-4" />
			</Button>
		{/if}
	</AlertDescription>
</Alert>
