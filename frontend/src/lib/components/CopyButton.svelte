<script lang="ts">
	import { Copy, Check, AlertCircle } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { copyToClipboard, isClipboardSupported } from '$lib/utils/clipboard';

	interface Props {
		text: string;
		title?: string;
		variant?: 'default' | 'ghost' | 'outline';
		size?: 'default' | 'sm' | 'lg' | 'icon';
		class?: string;
	}

	let {
		text,
		title = 'Copy to clipboard',
		variant = 'ghost',
		size = 'icon',
		class: className = ''
	}: Props = $props();

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

	const buttonTitle = $derived(() => {
		switch (copyState) {
			case 'copying':
				return 'Copying...';
			case 'success':
				return 'Copied!';
			case 'error':
				return errorMessage || 'Copy failed';
			default:
				return title;
		}
	});

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
		title={buttonTitle()}
		aria-label={ariaLabel()}
		class={`transition-all duration-200 ${className}`}
	>
		{#if copyState === 'copying'}
			<div class="h-4 w-4 animate-spin">
				<div class="h-2 w-2 rounded-full bg-current"></div>
			</div>
		{:else if copyState === 'success'}
			<Check class="h-4 w-4 text-green-600" />
		{:else if copyState === 'error'}
			<AlertCircle class="h-4 w-4 text-red-600" />
		{:else}
			<Copy class="h-4 w-4" />
		{/if}

		{#if size !== 'icon'}
			<span class="ml-2">
				{#if copyState === 'copying'}
					Copying...
				{:else if copyState === 'success'}
					Copied!
				{:else if copyState === 'error'}
					Failed
				{:else}
					Copy
				{/if}
			</span>
		{/if}
	</Button>
{/if}
