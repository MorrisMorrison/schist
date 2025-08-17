<script lang="ts">
	interface UploadStatusProps {
		isUploading: boolean;
		uploadProgress: number;
		uploadMessage: string | null;
		uploadError: string | null;
	}

	let {
		isUploading = false,
		uploadProgress = 0,
		uploadMessage = null,
		uploadError = null
	}: UploadStatusProps = $props();

	const shouldShow = $derived(isUploading || uploadMessage || uploadError);
</script>

{#if shouldShow}
	<div class="border-primary bg-background border-t px-4 py-2">
		{#if isUploading}
			<div class="flex items-center gap-3">
				<div class="flex-1">
					<div class="bg-muted h-2 overflow-hidden rounded-full">
						<div
							class="h-full bg-blue-500 transition-[width] duration-300"
							style="width: {uploadProgress}%"
						></div>
					</div>
				</div>
				<span class="text-foreground text-sm">
					{uploadMessage}
				</span>
			</div>
		{/if}
		{#if uploadMessage && !isUploading}
			<div class="text-sm text-green-600 dark:text-green-400">
				✓ {uploadMessage}
			</div>
		{/if}
		{#if uploadError}
			<div class="text-sm text-red-600 dark:text-red-400">
				✗ {uploadError}
			</div>
		{/if}
	</div>
{/if}