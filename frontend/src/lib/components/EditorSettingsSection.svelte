<script lang="ts">
	import { settings, settingsActions } from '$lib/stores/settings';
	import { Label } from '$lib/components/ui/label';
	import ToggleSlider from '$lib/components/ui/toggle-slider/ToggleSlider.svelte';

	function handleAlwaysHidePreviewChange(checked: boolean) {
		settingsActions.updateAppSetting('alwaysHidePreview', checked);
	}

	function handleAlwaysOpenFullscreenChange(checked: boolean) {
		settingsActions.updateAppSetting('alwaysOpenFullscreen', checked);
	}
</script>

<div class="space-y-6" data-testid="editor-settings-section">
	<div class="space-y-4">
		<!-- Always Hide Preview Setting -->
		<div class="space-y-3">
			<div class="flex items-center justify-between">
				<div class="space-y-1">
					<Label class="text-sm font-medium">Always hide preview</Label>
					<p class="text-muted-foreground text-xs">
						When editing documents, preview is hidden by default (can still be toggled on manually)
					</p>
				</div>
				<ToggleSlider
					checked={settings.app.alwaysHidePreview}
					onCheckedChange={handleAlwaysHidePreviewChange}
					size="sm"
				/>
			</div>
		</div>

		<!-- Always Open Fullscreen Setting -->
		<div class="space-y-3">
			<div class="flex items-center justify-between">
				<div class="space-y-1">
					<Label class="text-sm font-medium">Always open editor in fullscreen mode</Label>
					<p class="text-muted-foreground text-xs">
						Automatically opens the editor in fullscreen mode when editing any document
					</p>
				</div>
				<ToggleSlider
					checked={settings.app.alwaysOpenFullscreen}
					onCheckedChange={handleAlwaysOpenFullscreenChange}
					size="sm"
				/>
			</div>
		</div>
	</div>
</div>
