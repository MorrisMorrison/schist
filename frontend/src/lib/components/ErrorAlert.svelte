<script lang="ts">
	import { Alert, AlertDescription } from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { X, AlertCircle, AlertTriangle, Info } from '@lucide/svelte';
	import { cn } from '$lib/utils.js';

	import type { HTMLAttributes } from 'svelte/elements';

	export interface Props extends HTMLAttributes<HTMLDivElement> {
		error: string;
		variant?: 'error' | 'warning' | 'info';
		onDismiss?: () => void;
		class?: string;
	}

	let { error, variant = 'error', onDismiss, class: className, ...restProps }: Props = $props();

	// The library's alert variant per ErrorAlert variant; errors keep their tinted border.
	const alertVariant = { error: 'destructive', warning: 'warning', info: 'info' } as const;
	const errorClasses = 'border-destructive/50 dark:border-destructive';

	const icons = {
		error: AlertCircle,
		warning: AlertTriangle,
		info: Info
	};

	const IconComponent = $derived(icons[variant]);
</script>

<Alert
	variant={alertVariant[variant]}
	class={cn(variant === 'error' && errorClasses, className)}
	{...restProps}
>
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
