<script lang="ts">
	import { Copy, Check, AlertCircle } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { copyToClipboard, isClipboardSupported } from '$lib/utils/clipboard';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';

	interface Props {
		text: string;
		variant?: 'default' | 'ghost' | 'outline';
		size?: 'default' | 'sm' | 'lg' | 'icon';
		class?: string;
	}

	let { text, variant = 'ghost', size = 'icon', class: className = '' }: Props = $props();

	type CopyState = 'idle' | 'copying' | 'success' | 'error';
	let copyState = $state<CopyState>('idle');
	let errorMessage = $state('');

	const clipboardSupported = isClipboardSupported();

	async function handleCopy() {
		if (copyState === 'copying') return;

		copyState = 'copying';
		errorMessage = '';

		try {
			const result = await copyToClipboard(text);

			if (result.success) {
				copyState = 'success';
				setTimeout(() => {
					copyState = 'idle';
				}, 2000);
			} else {
				copyState = 'error';
				errorMessage = result.error || 'Failed to copy';
				setTimeout(() => {
					copyState = 'idle';
					errorMessage = '';
				}, 3000);
			}
		} catch (error) {
			copyState = 'error';
			errorMessage = error instanceof Error ? error.message : 'Copy failed';
			setTimeout(() => {
				copyState = 'idle';
				errorMessage = '';
			}, 3000);
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			handleCopy();
		}
	}

	const ariaLabel = $derived(() => {
		switch (copyState) {
			case 'copying':
				return 'Copying to clipboard';
			case 'success':
				return 'Successfully copied to clipboard';
			case 'error':
				return `Copy failed: ${errorMessage}`;
			default:
				return 'Copy code to clipboard';
		}
	});
</script>

{#if clipboardSupported}
	<Button
		{variant}
		{size}
		onclick={handleCopy}
		onkeydown={handleKeydown}
		disabled={copyState === 'copying'}
		title="Copy"
		aria-label={ariaLabel()}
		class={`transition-all duration-200 ${className}`}
	>
		{#if copyState === 'copying'}
			<LoadingSpinner size="sm" />
		{:else if copyState === 'success'}
			<Check class="h-4 w-4 text-green-600" />
		{:else if copyState === 'error'}
			<AlertCircle class="h-4 w-4 text-red-600" />
		{:else}
			<Copy class="h-4 w-4" />
		{/if}
	</Button>
{/if}
