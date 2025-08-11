<script lang="ts">
	import { Dialog, DialogContent } from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { X, ZoomIn, ZoomOut, RotateCw, ExternalLink, Download } from 'lucide-svelte';

	interface Props {
		src: string;
		alt: string;
		open: boolean;
		onClose: () => void;
	}

	let { src, alt, open, onClose }: Props = $props();

	let zoom = $state(1);
	let rotation = $state(0);
	let imageLoaded = $state(false);

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') onClose();
		if (event.key === '+' || event.key === '=') zoomIn();
		if (event.key === '-') zoomOut();
		if (event.key === 'r' || event.key === 'R') rotate();
	}

	function zoomIn() {
		zoom = Math.min(zoom * 1.25, 4);
	}

	function zoomOut() {
		zoom = Math.max(zoom / 1.25, 0.25);
	}

	function rotate() {
		rotation = (rotation + 90) % 360;
	}

	function openInNewTab() {
		window.open(src, '_blank');
	}

	function downloadImage() {
		const a = document.createElement('a');
		a.href = src;
		a.download = alt || 'image';
		a.click();
	}

	function resetTransform() {
		zoom = 1;
		rotation = 0;
	}

	// Reset transform when modal opens
	$effect(() => {
		if (open) {
			resetTransform();
			imageLoaded = false;
		}
	});
</script>

<svelte:window onkeydown={handleKeydown} />

<Dialog {open} onOpenChange={onClose}>
	<DialogContent
		class="!fixed !inset-0 !m-0 flex !h-screen !max-h-screen !w-screen !max-w-screen !translate-x-0 !translate-y-0 items-center justify-center overflow-hidden border-0 bg-black/95 p-0"
		showCloseButton={false}
	>
		<!-- Control Bar -->
		<div class="absolute top-4 right-4 z-10 flex gap-2 rounded-lg bg-black/50 p-2">
			<Button
				variant="ghost"
				size="sm"
				onclick={zoomOut}
				class="text-white hover:bg-white/20"
				disabled={zoom <= 0.25}
			>
				<ZoomOut class="h-4 w-4" />
			</Button>
			<Button
				variant="ghost"
				size="sm"
				onclick={zoomIn}
				class="text-white hover:bg-white/20"
				disabled={zoom >= 4}
			>
				<ZoomIn class="h-4 w-4" />
			</Button>
			<Button variant="ghost" size="sm" onclick={rotate} class="text-white hover:bg-white/20">
				<RotateCw class="h-4 w-4" />
			</Button>
			<Button
				variant="ghost"
				size="sm"
				onclick={resetTransform}
				class="text-white hover:bg-white/20"
			>
				Reset
			</Button>
			<Button
				variant="ghost"
				size="sm"
				onclick={downloadImage}
				class="text-white hover:bg-white/20"
			>
				<Download class="h-4 w-4" />
			</Button>
			<Button variant="ghost" size="sm" onclick={openInNewTab} class="text-white hover:bg-white/20">
				<ExternalLink class="h-4 w-4" />
			</Button>
			<Button variant="ghost" size="sm" onclick={onClose} class="text-white hover:bg-white/20">
				<X class="h-4 w-4" />
			</Button>
		</div>

		<!-- Loading Indicator -->
		{#if !imageLoaded}
			<div class="absolute inset-0 flex items-center justify-center">
				<div class="h-8 w-8 animate-spin rounded-full border-b-2 border-white"></div>
			</div>
		{/if}

		<!-- Image -->
		<img
			{src}
			{alt}
			class="max-h-[95vh] max-w-[95vw] object-contain transition-transform duration-200 select-none"
			class:opacity-0={!imageLoaded}
			style="transform: scale({zoom}) rotate({rotation}deg);"
			onload={() => (imageLoaded = true)}
			draggable="false"
		/>

		<!-- Image Info -->
		{#if alt && imageLoaded}
			<div
				class="absolute bottom-4 left-4 max-w-md rounded bg-black/70 px-3 py-2 text-sm text-white"
			>
				{alt}
				{#if zoom !== 1 || rotation !== 0}
					<div class="mt-1 text-xs opacity-75">
						Zoom: {Math.round(zoom * 100)}%
						{#if rotation !== 0}• Rotated: {rotation}°{/if}
					</div>
				{/if}
			</div>
		{/if}

		<!-- Keyboard Shortcuts Help -->
		<div class="absolute right-4 bottom-4 text-right text-xs text-white opacity-60">
			<div>ESC: Close • +/-: Zoom • R: Rotate</div>
		</div>
	</DialogContent>
</Dialog>
