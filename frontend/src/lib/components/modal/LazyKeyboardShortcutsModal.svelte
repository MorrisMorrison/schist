<script lang="ts">
	import { onMount } from 'svelte';

	interface Props {
		open: boolean;
		onClose: () => void;
	}

	const { open, onClose }: Props = $props();

	let ModalComponent = $state<typeof import('./KeyboardShortcutsModal.svelte').default | null>(null);
	let isLoaded = $state(false);

	// Only load the modal when it's needed (when open is true for the first time)
	$effect(() => {
		if (open && !isLoaded) {
			loadModal();
		}
	});

	async function loadModal() {
		if (isLoaded) return;
		
		try {
			const modalModule = await import('./KeyboardShortcutsModal.svelte');
			ModalComponent = modalModule.default;
			isLoaded = true;
		} catch (error) {
			console.error('Failed to load keyboard shortcuts modal:', error);
		}
	}
</script>

{#if ModalComponent}
	<ModalComponent {open} {onClose} />
{/if}